const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode");
const { EventEmitter } = require("events");

const config = require("../config");
const { loadCommands } = require("./commands");

// state.status: "idle" | "awaiting_code" | "awaiting_qr" | "connected" | "disconnected"
const state = {
  status: "idle",
  pairingCode: null,
  qr: null, // data URL of the QR code image, when using QR pairing
  lastError: null,
};

const bus = new EventEmitter();
const commands = loadCommands();

const fs = require("fs");

let sock = null;
let pendingPhoneNumber = null; // number to pair once the new socket is ready
let pairingRequestedForThisSocket = false;

// Loaded once and kept in memory for the life of the process. Re-reading
// from disk on every reconnect caused a race: WhatsApp's server would see
// stale/half-written credentials right after issuing a pairing code and
// kill the session, which showed up as "invalid code" on the phone.
let cachedAuthState = null;
let cachedSaveCreds = null;

async function loadAuth() {
  if (!cachedAuthState) {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, "..", config.AUTH_FOLDER)
    );
    cachedAuthState = state;
    cachedSaveCreds = saveCreds;
  }
  return { authState: cachedAuthState, saveCreds: cachedSaveCreds };
}

/** Wipes the in-memory + on-disk session so the next pairing attempt starts clean. */
function resetAuth() {
  cachedAuthState = null;
  cachedSaveCreds = null;
  try {
    fs.rmSync(path.join(__dirname, "..", config.AUTH_FOLDER), { recursive: true, force: true });
  } catch (_) {
    // nothing to clean up — fine
  }
}

function setState(patch) {
  Object.assign(state, patch);
  bus.emit("update", state);
}

async function requestPairingCodeWithRetry(activeSock, phoneNumber, attempts = 4) {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    // Give the socket a moment to finish its handshake before asking —
    // longer on the first try, shorter after since it's likely open by then.
    await new Promise((r) => setTimeout(r, i === 1 ? 2000 : 2500));
    try {
      return await activeSock.requestPairingCode(digits);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function startSocket({ phoneNumber } = {}) {
  // Never let two sockets run at once — close whatever's active first.
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(new Error("Restarting socket"));
    } catch (_) {
      // socket may already be dead — fine to ignore
    }
    sock = null;
  }

  if (phoneNumber) {
    pendingPhoneNumber = phoneNumber;
    pairingRequestedForThisSocket = false;
  }

  const { authState, saveCreds } = await loadAuth();
  const { version } = await fetchLatestBaileysVersion();

  const newSock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: [config.BOT_NAME, "Chrome", "1.0.0"],
  });
  sock = newSock;

  if (pendingPhoneNumber && !newSock.authState.creds.registered && !pairingRequestedForThisSocket) {
    pairingRequestedForThisSocket = true;
    requestPairingCodeWithRetry(newSock, pendingPhoneNumber)
      .then((code) => {
        setState({ status: "awaiting_code", pairingCode: code, lastError: null });
      })
      .catch((err) => {
        setState({ status: "disconnected", lastError: err.message });
      });
  }

  newSock.ev.on("creds.update", saveCreds);

  newSock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Baileys emits this automatically whenever no pairing code has been
    // requested for this socket — i.e. the classic QR-scan method.
    if (qr && !pendingPhoneNumber) {
      QRCode.toDataURL(qr)
        .then((dataUrl) => setState({ status: "awaiting_qr", qr: dataUrl, lastError: null }))
        .catch((err) => setState({ status: "disconnected", lastError: err.message }));
    }

    if (connection === "open") {
      pendingPhoneNumber = null;
      setState({ status: "connected", pairingCode: null, qr: null, lastError: null });
      console.log("WhatsApp connected.");
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      // restartRequired fires right after a pairing code is issued —
      // this is expected, not an error. Reconnect with the SAME code
      // still valid, don't request a new one and don't scare the user.
      const isExpectedRestart = statusCode === DisconnectReason.restartRequired;

      if (loggedOut) {
        resetAuth();
        setState({ status: "disconnected", pairingCode: null });
        console.log("Logged out. Re-pair from the website to reconnect.");
        return;
      }

      if (!isExpectedRestart) {
        setState({ status: "disconnected" });
      }

      console.log(isExpectedRestart ? "Restart required, reconnecting…" : "Connection closed, reconnecting…");
      startSocket().catch((err) => setState({ status: "disconnected", lastError: err.message }));
    }
  });

  newSock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg?.message) return;

    const jid = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    if (!text.startsWith(config.PREFIX)) return;

    const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    try {
      await command.execute({ sock: newSock, msg, jid, args, commands });
    } catch (err) {
      console.error(`Error running command "${cmdName}":`, err);
      await newSock.sendMessage(jid, { text: "⚠️ Something went wrong running that command." });
    }
  });

  return newSock;
}

function getState() {
  return state;
}

function onUpdate(listener) {
  bus.on("update", listener);
  return () => bus.off("update", listener);
}

module.exports = { startSocket, getState, onUpdate };
