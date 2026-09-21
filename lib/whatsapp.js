const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode");
const { EventEmitter } = require("events");

const config = require("../config");
const { loadCommands } = require("./commands");
const { handleCivilguardDetection } = require("./civilguard");
const { handleHangmanGuess } = require("./hangman");
const { handleTicTacToeMove } = require("./tictactoe");
const { handleScrambleGuess } = require("./scramble");
const { handleMathAnswer } = require("./mathquiz");

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
let consecutiveFailures = 0; // tracks unbroken run of failed reconnects, for backoff

// --- Duplicate-message guard --------------------------------------------
const processedMessageIds = new Set();
const PROCESSED_ID_CACHE_SIZE = 1000;
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  if (processedMessageIds.size > PROCESSED_ID_CACHE_SIZE) {
    processedMessageIds.delete(processedMessageIds.values().next().value);
  }
  return false;
}

// --- Group metadata cache ---------------------------------------------
const GROUP_METADATA_TTL_MS = 5 * 60 * 1000;
const groupMetadataCache = new Map(); // jid -> { data, fetchedAt }

async function getGroupMetadata(activeSock, jid, { force = false } = {}) {
  const cached = groupMetadataCache.get(jid);
  if (!force && cached && Date.now() - cached.fetchedAt < GROUP_METADATA_TTL_MS) {
    return cached.data;
  }
  const data = await activeSock.groupMetadata(jid);
  groupMetadataCache.set(jid, { data, fetchedAt: Date.now() });
  return data;
}

// --- Message store for retries ------------------------------------------
const MESSAGE_STORE_LIMIT = 200;
const messageStore = new Map(); // message id -> message content

function rememberMessage(key, message) {
  if (!key?.id || !message) return;
  messageStore.set(key.id, message);
  if (messageStore.size > MESSAGE_STORE_LIMIT) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

function createSimpleCache() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    set: (k, v) => map.set(k, v),
    del: (k) => map.delete(k),
    flushAll: () => map.clear(),
  };
}
const msgRetryCounterCache = createSimpleCache();

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

function resetAuth() {
  cachedAuthState = null;
  cachedSaveCreds = null;
  try {
    fs.rmSync(path.join(__dirname, "..", config.AUTH_FOLDER), { recursive: true, force: true });
  } catch (_) {}
}

function setState(patch) {
  Object.assign(state, patch);
  bus.emit("update", state);
}

async function requestPairingCodeWithRetry(activeSock, phoneNumber, attempts = 4) {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    await new Promise((r) => setTimeout(r, i === 1 ? 2000 : 2500));
    try {
      return await activeSock.requestPairingCode(digits);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function startSocket({ phoneNumber, forceReset = false } = {}) {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(new Error("Restarting socket"));
    } catch (_) {}
    sock = null;
  }

  if (forceReset) {
    resetAuth();
    pendingPhoneNumber = null;
    pairingRequestedForThisSocket = false;
  }

  if (phoneNumber) {
    pendingPhoneNumber = phoneNumber;
    pairingRequestedForThisSocket = false;
  } else if (!forceReset) {
    pendingPhoneNumber = null;
  }

  const { authState, saveCreds } = await loadAuth();
  let version;
  try {
    ({ version } = await fetchLatestWaWebVersion());
  } catch (err) {
    console.warn("fetchLatestWaWebVersion failed, falling back:", err.message);
    ({ version } = await fetchLatestBaileysVersion());
  }

  const newSock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    defaultQueryTimeoutMs: 120000,
    shouldSyncHistoryMessage: () => false,
    cachedGroupMetadata: (jid) => getGroupMetadata(newSock, jid),
    getMessage: async (key) => messageStore.get(key.id),
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

  const originalSendMessage = newSock.sendMessage.bind(newSock);
  newSock.sendMessage = async (...sendArgs) => {
    const sent = await originalSendMessage(...sendArgs);
    if (sent?.key && sent?.message) rememberMessage(sent.key, sent.message);
    return sent;
  };

  newSock.ev.on("creds.update", saveCreds);

  newSock.ev.on("groups.update", async ([update]) => {
    if (!update?.id) return;
    try {
      await getGroupMetadata(newSock, update.id, { force: true });
    } catch (_) {}
  });
  newSock.ev.on("group-participants.update", async ({ id }) => {
    try {
      await getGroupMetadata(newSock, id, { force: true });
    } catch (_) {}
  });

  newSock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pendingPhoneNumber) {
      QRCode.toDataURL(qr)
        .then((dataUrl) => setState({ status: "awaiting_qr", qr: dataUrl, lastError: null }))
        .catch((err) => setState({ status: "disconnected", lastError: err.message }));
    }

    if (connection === "open") {
      pendingPhoneNumber = null;
      consecutiveFailures = 0;
      setState({ status: "connected", pairingCode: null, qr: null, lastError: null });
      console.log("WhatsApp connected.");
    }

    if (connection === "close") {
      const boomError = new Boom(lastDisconnect?.error);
      const statusCode = boomError?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
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

      console.log(
        isExpectedRestart
          ? "Restart required, reconnecting…"
          : `Connection closed (code: ${statusCode ?? "unknown"}, reason: ${boomError?.message || "unknown"}), reconnecting…`
      );

      if (isExpectedRestart) {
        consecutiveFailures = 0;
        startSocket().catch((err) => setState({ status: "disconnected", lastError: err.message }));
      } else {
        consecutiveFailures += 1;
        const delayMs = Math.min(30000, 1000 * 2 ** (consecutiveFailures - 1));
        console.log(`Waiting ${delayMs}ms before reconnect attempt #${consecutiveFailures}…`);
        setTimeout(() => {
          startSocket().catch((err) => setState({ status: "disconnected", lastError: err.message }));
        }, delayMs);
      }
    }
  });

  newSock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      const msg = messages[0];
      const debugJid = msg?.key?.remoteJid;
      console.log(
        `messages.upsert: type=${type} jid=${debugJid} fromMe=${msg?.key?.fromMe} hasMessage=${!!msg?.message}`
      );

      if (type !== "notify") return;
      if (!msg?.message) return;
      if (alreadyProcessed(msg.key?.id)) {
        console.log(`messages.upsert: skipping duplicate delivery of ${msg.key?.id}`);
        return;
      }

      rememberMessage(msg.key, msg.message);

      const jid = msg.key.remoteJid;
      // WhatsApp wraps a message YOU send from your primary phone in an
      // extra deviceSentMessage layer when syncing it to linked devices
      // (like this bot) — the real content sits one level deeper. Without
      // unwrapping this, every self-sent command (any private-chat test,
      // since that's always "you" typing) read back as empty text, while
      // messages from OTHER people in a group — which never get this
      // wrapper — worked fine. ephemeralMessage (disappearing messages)
      // wraps the same way, so it's unwrapped here too.
      const messageContent =
        msg.message.deviceSentMessage?.message || msg.message.ephemeralMessage?.message || msg.message;
      const text =
        messageContent.conversation ||
        messageContent.extendedTextMessage?.text ||
        messageContent.imageMessage?.caption ||
        "";

      console.log(`messages.upsert: text=${JSON.stringify(text)} prefix=${config.PREFIX}`);

      if (jid.endsWith("@g.us") && !msg.key.fromMe) {
        try {
          const senderJid = msg.key.participant || msg.key.remoteJid;
          const acted = await handleCivilguardDetection({
            sock: newSock,
            jid,
            msg,
            text,
            senderJid,
            getGroupMetadata: (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts),
          });
          if (acted) return;
        } catch (err) {
          console.error("civilguard detection error:", err);
        }

        try {
          const senderJid = msg.key.participant || msg.key.remoteJid;
          const sendTextForGames = (t) => newSock.sendMessage(jid, { text: t });

          const hangmanHandled = await handleHangmanGuess({ chatId: jid, text, sendText: sendTextForGames });
          if (hangmanHandled) return;

          const tttHandled = await handleTicTacToeMove({
            chatId: jid,
            senderId: senderJid,
            text,
            sendText: sendTextForGames,
          });
          if (tttHandled) return;

          const scrambleHandled = await handleScrambleGuess({ chatId: jid, text, sendText: sendTextForGames });
          if (scrambleHandled) return;

          const mathHandled = await handleMathAnswer({ chatId: jid, text, sendText: sendTextForGames });
          if (mathHandled) return;
        } catch (err) {
          console.error("game move handling error:", err);
        }
      }

      if (!text.startsWith(config.PREFIX)) return;

      const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
      const command = commands.get(cmdName.toLowerCase());
      if (!command) return;

      const messageTimestampMs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const quotedMessage = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText =
        quotedMessage?.conversation ||
        quotedMessage?.extendedTextMessage?.text ||
        quotedMessage?.imageMessage?.caption ||
        null;

      const platformCtx = {
        platform: "whatsapp",
        chatId: jid,
        senderId: msg.key.participant || msg.key.remoteJid,
        isGroup: jid.endsWith("@g.us"),
        text,
        messageTimestampMs,
        quotedText,
        // `opts.mentions`: array of phone numbers (digits only, no "+") to
        // tag. The message text must separately contain "@<number>" for
        // each one — WhatsApp renders the tag from that combination, not
        // from the mentions array alone.
        async sendText(msgText, opts = {}) {
          const mentions = (opts.mentions || []).map((n) => `${n.replace(/[^0-9]/g, "")}@s.whatsapp.net`);
          return newSock.sendMessage(jid, { text: msgText, mentions }, { quoted: msg });
        },
        async sendImage(source, caption) {
          const image = Buffer.isBuffer(source) ? source : { url: source };
          return newSock.sendMessage(jid, { image, caption }, { quoted: msg });
        },
        async sendSticker(buffer) {
          return newSock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
        },
        async reply(msgText) {
          return newSock.sendMessage(jid, { text: msgText }, { quoted: msg });
        },
      };

      try {
        await command.execute({
          sock: newSock,
          msg,
          jid,
          args,
          commands,
          getGroupMetadata: (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts),
          ...platformCtx,
        });
      } catch (err) {
        console.error(`Error running command "${cmdName}":`, err);
        try {
          await newSock.sendMessage(jid, { text: "⚠️ Something went wrong running that command." });
        } catch (sendErr) {
          console.error(`Also failed to send the error notice for "${cmdName}":`, sendErr);
        }
      }
    } catch (err) {
      console.error("Unexpected error in messages.upsert handler:", err);
    }
  });

  return newSock;
}

async function resumeSavedSession() {
  try {
    const { authState } = await loadAuth();
    if (authState.creds.registered) {
      console.log("Found saved session, reconnecting…");
      await startSocket();
    }
  } catch (err) {
    console.error("Failed to resume saved session:", err.message);
  }
}

function getState() {
  return state;
}

function onUpdate(listener) {
  bus.on("update", listener);
  return () => bus.off("update", listener);
}

module.exports = { startSocket, getState, onUpdate, getGroupMetadata, resumeSavedSession };
