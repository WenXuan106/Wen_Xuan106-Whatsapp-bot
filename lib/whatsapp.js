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

// Simple in-memory status the website polls.
// state: "idle" | "awaiting_code" | "connected" | "disconnected"
const state = {
  status: "idle",
  pairingCode: null,
  lastError: null,
};

const bus = new EventEmitter();
const commands = loadCommands();
let sock = null;

async function startSocket({ phoneNumber } = {}) {
  const { state: authState, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, "..", config.AUTH_FOLDER)
  );
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: [config.BOT_NAME, "Chrome", "1.0.0"],
  });

  // If we're not registered yet and a phone number was supplied,
  // ask WhatsApp for a pairing code instead of a QR code.
  if (phoneNumber && !sock.authState.creds.registered) {
    // Baileys needs a short beat after socket creation before requesting a code.
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
        state.status = "awaiting_code";
        state.pairingCode = code;
        bus.emit("update", state);
      } catch (err) {
        state.status = "disconnected";
        state.lastError = err.message;
        bus.emit("update", state);
      }
    }, 1500);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      state.status = "connected";
      state.pairingCode = null;
      state.lastError = null;
      bus.emit("update", state);
      console.log("WhatsApp connected.");
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      state.status = "disconnected";
      bus.emit("update", state);

      if (!loggedOut) {
        console.log("Connection closed, reconnecting...");
        startSocket();
      } else {
        console.log("Logged out. Delete the auth folder and pair again to reconnect.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
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
      await command.execute({ sock, msg, jid, args, commands });
    } catch (err) {
      console.error(`Error running command "${cmdName}":`, err);
      await sock.sendMessage(jid, { text: "⚠️ Something went wrong running that command." });
    }
  });

  return sock;
}

function getState() {
  return state;
}

function onUpdate(listener) {
  bus.on("update", listener);
  return () => bus.off("update", listener);
}

module.exports = { startSocket, getState, onUpdate };
