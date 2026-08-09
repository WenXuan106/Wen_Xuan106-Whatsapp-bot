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
// WhatsApp can redeliver the same message as a fresh "notify" event —
// most often right after a reconnect, if the previous socket dropped
// before acking it. Without this, that redelivery runs the command a
// second (or third) time and looks like the bot "repeating itself".
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
    // A custom identifier here (e.g. the bot's own name) can cause WhatsApp
    // to skip the "enter code to link" push notification on the primary
    // phone — it seems to rely on recognizing a standard client signature.
    // Bots that reliably show that notification are usually presenting one
    // of Baileys' well-known tuples, so we do the same.
    browser: Browsers.ubuntu("Chrome"),
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
    // speed
