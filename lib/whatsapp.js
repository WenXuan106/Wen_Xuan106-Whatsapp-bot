const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
  jidNormalizedUser,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode");
const { EventEmitter } = require("events");

const config = require("../config");
const { loadCommands } = require("./commands");
const { handleCivilguardDetection } = require("./civilguard");
const { touchUser } = require("./scores");
const { isBotDisabled } = require("./botswitch");
const { checkRateLimit } = require("./ratelimit");
const {
  getGroupAdminStatus,
  getMentionedJid,
  getQuotedParticipant,
  resolveParticipantId,
  isOwner,
} = require("./admin");
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
        messageContent.documentMessage?.caption ||
        messageContent.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        "";

      console.log(`messages.upsert: text=${JSON.stringify(text)} prefix=${config.PREFIX}`);

      // "!bot off" silences the bot in a group: no civilguard, no game
      // handling, and no commands except "!bot" itself (to turn it back on).
      const botOff = jid.endsWith("@g.us") && isBotDisabled(jid);

      if (jid.endsWith("@g.us") && !msg.key.fromMe && !botOff) {
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
          // Who is playing — used by the scoring system (see lib/scores.js).
          const senderName = msg.pushName || senderJid.split("@")[0];

          const hangmanHandled = await handleHangmanGuess({
            chatId: jid,
            text,
            sendText: sendTextForGames,
            senderId: senderJid,
            senderName,
          });
          if (hangmanHandled) return;

          const tttHandled = await handleTicTacToeMove({
            chatId: jid,
            senderId: senderJid,
            senderName,
            text,
            sendText: sendTextForGames,
          });
          if (tttHandled) return;

          const scrambleHandled = await handleScrambleGuess({
            chatId: jid,
            text,
            sendText: sendTextForGames,
            senderId: senderJid,
            senderName,
          });
          if (scrambleHandled) return;

          const mathHandled = await handleMathAnswer({
            chatId: jid,
            text,
            sendText: sendTextForGames,
            senderId: senderJid,
            senderName,
          });
          if (mathHandled) return;
        } catch (err) {
          console.error("game move handling error:", err);
        }
      }

      if (!text.startsWith(config.PREFIX)) return;

      const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
      const command = commands.get(cmdName.toLowerCase());
      if (!command) return;
      if (botOff && command.name !== "bot") return;

      const messageTimestampMs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const quotedMessage = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText =
        quotedMessage?.conversation ||
        quotedMessage?.extendedTextMessage?.text ||
        quotedMessage?.imageMessage?.caption ||
        null;

      // When the bot's own account sends the command, WhatsApp leaves out
      // the participant, so use the bot's own number as the sender instead of
      // the chat id (which would make the sender look like the group itself).
      const senderId = msg.key.fromMe
        ? jidNormalizedUser(newSock.user?.id || "") || msg.key.participant || msg.key.remoteJid
        : msg.key.participant || msg.key.remoteJid;
      const senderName = msg.pushName || senderId.split("@")[0];
      touchUser(senderId, senderName);

      // Anti-spam: see lib/ratelimit.js (limits live in config.js).
      const limit = checkRateLimit({
        userId: senderId,
        commandName: command.name,
        isOwner: isOwner(msg, config),
      });
      if (!limit.allowed) {
        if (limit.notify) {
          try {
            await newSock.sendMessage(jid, { text: limit.message }, { quoted: msg });
          } catch (err) {
            console.error("Failed to send the rate-limit notice:", err.message);
          }
        }
        return;
      }

      const platformCtx = {
        platform: "whatsapp",
        chatId: jid,
        senderId,
        senderName,
        commandName: cmdName.toLowerCase(),
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
        /** Text of a file sent with this message (as a document) or of the file this message replies to. null if none. */
        async getDocumentText(maxBytes = 8 * 1024 * 1024) {
          const docOf = (m) => m?.documentMessage || m?.documentWithCaptionMessage?.message?.documentMessage || null;
          const info = messageContent.extendedTextMessage?.contextInfo;
          const quoted = info?.quotedMessage;

          let doc = docOf(messageContent);
          let source = doc ? { key: msg.key, message: messageContent } : null;
          if (!doc && docOf(quoted)) {
            doc = docOf(quoted);
            source = {
              key: { remoteJid: msg.key.remoteJid, id: info.stanzaId, fromMe: false, participant: info.participant },
              message: quoted,
            };
          }
          if (!doc) return null;

          if (Number(doc.fileLength || 0) > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
          const buffer = await downloadMediaMessage(source, "buffer", {}, { reuploadRequest: newSock.updateMediaMessage });
          if (buffer.length > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
          return buffer.toString("utf8");
        },
        async sendSticker(buffer) {
          return newSock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
        },
        async reply(msgText) {
          return newSock.sendMessage(jid, { text: msgText }, { quoted: msg });
        },

        // --- Platform-neutral helpers -------------------------------------
        // Commands use these instead of talking to Baileys directly so the
        // same command file works on both WhatsApp and Telegram. See the
        // matching block in lib/telegram.js.
        commands,

        /** How an id is written after "@" in a mention tag. */
        shortId(id) {
          return String(id).split("@")[0];
        },
        /** Sends text; each id in `ids` is turned into a real mention. The text
         * must contain "@<shortId>" for every id listed. */
        async sendMention(msgText, ids = []) {
          return newSock.sendMessage(jid, { text: msgText, mentions: ids }, { quoted: msg });
        },
        /** Sends a playable voice note from Ogg/Opus bytes. */
        async sendVoice(buffer) {
          return newSock.sendMessage(
            jid,
            { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
            { quoted: msg }
          );
        },

        /** Whoever the command @mentions, or else whoever it replies to. Null if neither. */
        getTargetUser() {
          return getMentionedJid(msg) || getQuotedParticipant(msg);
        },
        /** URL of a user's profile picture, or null if they have none / it's private. */
        async getProfilePictureUrl(id) {
          if (!id) return null;
          try {
            return (await newSock.profilePictureUrl(id, "image")) || null;
          } catch (_) {
            return null;
          }
        },
        /** Converts a raw target into the exact id form the group itself uses
         * (needed before remove/promote/demote/warn — see resolveParticipantId). */
        async resolveMember(rawId) {
          const metadata = await getGroupMetadata(newSock, jid);
          return resolveParticipantId(newSock, metadata.participants, rawId);
        },
        /** { senderIsAdmin, botIsAdmin } for this group. */
        async getAdminStatus() {
          const { senderIsAdmin, botIsAdmin } = await getGroupAdminStatus(
            newSock,
            jid,
            msg,
            (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts)
          );
          return { senderIsAdmin, botIsAdmin };
        },
        isBotId(id) {
          return id === newSock.user?.id;
        },
        isOwner() {
          return isOwner(msg, config);
        },

        /** Every member's id in this group. */
        async listMembers() {
          const metadata = await getGroupMetadata(newSock, jid);
          return metadata.participants.map((p) => p.id);
        },
        /** { name, id, ownerId, createdAt, memberCount, adminCount, description }. */
        async getGroupInfo() {
          const metadata = await getGroupMetadata(newSock, jid);
          const admins = metadata.participants.filter((p) => p.admin === "admin" || p.admin === "superadmin");
          return {
            name: metadata.subject,
            id: jid,
            ownerId: metadata.owner || null,
            createdAt: metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString() : "Unknown",
            memberCount: metadata.participants.length,
            adminCount: admins.length,
            description: metadata.desc || null,
          };
        },

        /** Removes a member from the group. Resolves to true on success. */
        async removeMember(rawId) {
          const target = await platformCtx.resolveMember(rawId);
          const result = await newSock.groupParticipantsUpdate(jid, [target], "remove");
          return result?.[0]?.status === "200";
        },
        /** Promotes (makeAdmin = true) or demotes a member. Resolves to true on success. */
        async setMemberAdmin(rawId, makeAdmin) {
          const target = await platformCtx.resolveMember(rawId);
          const result = await newSock.groupParticipantsUpdate(jid, [target], makeAdmin ? "promote" : "demote");
          return result?.[0]?.status === "200";
        },
        /** locked = true: only admins can send. Throws if WhatsApp refuses. */
        async setGroupLocked(locked) {
          await newSock.groupSettingUpdate(jid, locked ? "announcement" : "not_announcement");
        },

        /** True if this command is a reply to another message. */
        hasReply() {
          return !!msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        },
        /** Deletes the message this command replied to. Resolves to true on success. */
        async deleteReplied() {
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
          if (!contextInfo?.stanzaId) return false;
          await newSock.sendMessage(jid, {
            delete: {
              remoteJid: jid,
              fromMe: false,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
            },
          });
          return true;
        },
        /** Stops the platform connection (used by !stop just before exiting). */
        async shutdown() {
          try {
            newSock.end(new Error("Stopped via !stop command"));
          } catch (_) {
            // socket may already be closing — fine to ignore
          }
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

// Groups the bot's WhatsApp account is in, as [{ id, name }] — used by the
// website's on/off switch. Returns null while WhatsApp isn't connected.
// Cached briefly so refreshing the page doesn't hammer WhatsApp.
let groupListCache = { at: 0, groups: null };

async function listGroups() {
  if (!sock || state.status !== "connected") return null;
  if (groupListCache.groups && Date.now() - groupListCache.at < 20000) return groupListCache.groups;
  try {
    const all = await sock.groupFetchAllParticipating();
    const groups = Object.values(all).map((g) => ({ id: g.id, name: g.subject || g.id }));
    groupListCache = { at: Date.now(), groups };
    return groups;
  } catch (err) {
    console.error("listGroups failed:", err.message);
    return groupListCache.groups; // stale list (or null) is better than an error
  }
}

function getState() {
  return state;
}

function onUpdate(listener) {
  bus.on("update", listener);
  return () => bus.off("update", listener);
}

module.exports = { startSocket, getState, onUpdate, getGroupMetadata, resumeSavedSession, listGroups };
