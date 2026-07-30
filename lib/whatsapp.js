const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode");
const { EventEmitter } = require("events");

const config = require("../config");
const { loadCommands } = require("./commands");
const { handleCivilguardDetection } = require("./civilguard");

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

// --- Group metadata cache ---------------------------------------------
// Without this, Baileys re-fetches the full participant list from
// WhatsApp's servers on almost every group message (to know who to
// encrypt for) — that round trip is the main reason group chats feel
// slow. We keep our own cache and hand it to Baileys via
// `cachedGroupMetadata`, and refresh it whenever membership actually
// changes instead of on every message.
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
// Baileys needs to be able to look up recently sent messages when a
// group member's device requests a retry (e.g. their session state was
// out of sync). Without a `getMessage` implementation it has nothing to
// hand back, so it stalls/re-sends — which shows up as slow or
// duplicated messages in groups specifically. Cap the size so this
// can't grow unbounded.
const MESSAGE_STORE_LIMIT = 200;
const messageStore = new Map(); // message id -> message content

function rememberMessage(key, message) {
  if (!key?.id || !message) return;
  messageStore.set(key.id, message);
  if (messageStore.size > MESSAGE_STORE_LIMIT) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

// Minimal NodeCache-shaped in-memory cache (get/set/del/flushAll) so we
// don't need an extra dependency just for Baileys' internal retry counter.
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

async function startSocket({ phoneNumber, forceReset = false } = {}) {
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

  // Explicit pairing requests (user clicked "request code" / "use QR")
  // mean the user knows they're not connected right now. If the creds on
  // disk say registered:true anyway — e.g. left over from before a volume
  // was attached, or invalidated on WhatsApp's side — Baileys will trust
  // that flag, skip pairing entirely, and silently try (and fail) to
  // resume a dead session, so no code or QR ever appears. Wipe first so
  // pairing always actually happens when explicitly asked for.
  if (forceReset) {
    resetAuth();
    pendingPhoneNumber = null;
    pairingRequestedForThisSocket = false;
  }

  if (phoneNumber) {
    pendingPhoneNumber = phoneNumber;
    pairingRequestedForThisSocket = false;
  } else if (!forceReset) {
    // No phone number this call (e.g. QR flow) — don't let a stale
    // pendingPhoneNumber from an earlier attempt linger and suppress the
    // "qr" event below.
    pendingPhoneNumber = null;
  }

  const { authState, saveCreds } = await loadAuth();
  // fetchLatestBaileysVersion reads Baileys' own bundled reference data,
  // which can lag behind and report a version WhatsApp has already
  // expired — that mismatch is what causes "405 Connection Failure"
  // during pairing. fetchLatestWaWebVersion checks WhatsApp's live
  // version-check endpoint instead, so it stays current. Fall back to
  // the bundled version only if that live check itself fails.
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
    browser: [config.BOT_NAME, "Chrome", "1.0.0"],
    // Skip full chat-history sync and presence broadcasting on connect —
    // we only care about live incoming commands, so this cuts several
    // seconds off the time it takes to go from "connected" to actually
    // being able to answer.
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    // Lets Baileys use our cache instead of fetching group participants
    // fresh on every group message — the single biggest group-chat
    // speed fix.
    cachedGroupMetadata: (jid) => Promise.resolve(groupMetadataCache.get(jid)?.data),
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

  // Capture outgoing messages into the same store, so a retry request for
  // something the bot just sent (common in busy groups) can be served
  // from memory instead of failing.
  const originalSendMessage = newSock.sendMessage.bind(newSock);
  newSock.sendMessage = async (...sendArgs) => {
    const sent = await originalSendMessage(...sendArgs);
    if (sent?.key && sent?.message) rememberMessage(sent.key, sent.message);
    return sent;
  };

  newSock.ev.on("creds.update", saveCreds);

  // Keep the group metadata cache correct as soon as membership/admin
  // status actually changes, instead of only relying on the TTL.
  newSock.ev.on("groups.update", async ([update]) => {
    if (!update?.id) return;
    try {
      await getGroupMetadata(newSock, update.id, { force: true });
    } catch (_) {
      // group may have become inaccessible — fine, cache will just miss
    }
  });
  newSock.ev.on("group-participants.update", async ({ id }) => {
    try {
      await getGroupMetadata(newSock, id, { force: true });
    } catch (_) {
      // same as above
    }
  });

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
      consecutiveFailures = 0;
      setState({ status: "connected", pairingCode: null, qr: null, lastError: null });
      console.log("WhatsApp connected.");
    }

    if (connection === "close") {
      const boomError = new Boom(lastDisconnect?.error);
      const statusCode = boomError?.output?.statusCode;
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

      // Log WHY it closed — statusCode and message — so failures that
      // keep repeating are actually diagnosable instead of just showing
      // as an endless "reconnecting" with no reason.
      console.log(
        isExpectedRestart
          ? "Restart required, reconnecting…"
          : `Connection closed (code: ${statusCode ?? "unknown"}, reason: ${boomError?.message || "unknown"}), reconnecting…`
      );

      // Back off before retrying. Without this, a session that fails
      // instantly on every attempt (bad creds, blocked network, etc.)
      // reconnects in an unthrottled loop forever — burning CPU/network
      // and spamming logs without ever surfacing the real problem.
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
    const msg = messages[0];
    const debugJid = msg?.key?.remoteJid;
    console.log(
      `messages.upsert: type=${type} jid=${debugJid} fromMe=${msg?.key?.fromMe} hasMessage=${!!msg?.message}`
    );

    if (type !== "notify") return;
    if (!msg?.message) return;

    rememberMessage(msg.key, msg.message);

    const jid = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    console.log(`messages.upsert: text=${JSON.stringify(text)} prefix=${config.PREFIX}`);

    // Civilguard has to see ordinary chat (not just commands) to filter it,
    // so this runs before the command-prefix check below.
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
    }

    if (!text.startsWith(config.PREFIX)) return;

    const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    try {
      await command.execute({
        sock: newSock,
        msg,
        jid,
        args,
        commands,
        getGroupMetadata: (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts),
      });
    } catch (err) {
      console.error(`Error running command "${cmdName}":`, err);
      await newSock.sendMessage(jid, { text: "⚠️ Something went wrong running that command." });
    }
  });

  return newSock;
}

// Called once at process boot. If a previous pairing already left valid,
// registered credentials on disk, reconnect using them automatically —
// no phone number, no new pairing code. This is safe to run unconditionally
// because it never sets `pendingPhoneNumber`, so it can't collide with a
// user-submitted phone number the way the old "always start on boot" code
// did (see the comment in index.js).
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
