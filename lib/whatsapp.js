const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const { EventEmitter } = require("events");

const config = require("../config");
const { loadCommands } = require("./commands");

// state.status: "idle" | "awaiting_code" | "connected" | "disconnected"
const state = {
  status: "idle",
  pairingCode: null,
  lastError: null,
};

const bus = new EventEmitter();
const commands = loadCommands();

let sock = null;
let pendingPhoneNumber = null; // number to pair once the new socket is ready
let pairingRequestedForThisSocket = false;

function setState(patch) {
  Object.assign(state, patch);
  bus.emit("update", state);
}

/** Waits until the socket's underlying connection is actually open, or times out. */
function waitForSocketOpen(activeSock, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (activeSock.ws?.readyState === 1 /* OPEN */) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("Timed out connecting to WhatsApp."));
      setTimeout(check, 250);
    };
    check();
  });
}

async function requestPairingCodeWithRetry(activeSock, phoneNumber, attempts = 3) {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  for (let i = 1; i <= attempts; i++) {
    try {
      await waitForSocketOpen(activeSock);
      const code = await activeSock.requestPairingCode(digits);
      return code;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
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

  const { state: authState, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, "..", config.AUTH_FOLDER)
  );
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
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      pendingPhoneNumber = null;
      setState({ status: "connected", pairingCode: null, lastError: null });
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
    if (!msg?.message || msg.key.fromMe) return;

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
