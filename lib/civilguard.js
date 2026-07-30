const fs = require("fs");
const path = require("path");
const { getGroupAdminStatus } = require("./admin");

const DATA_FILE = path.join(__dirname, "..", "data", "civilguard.json");

// Built-in word list. Groups can add their own on top of this with
// "!civilguard add <word>".
const DEFAULT_BADWORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "pussy",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "slut",
  "whore",
  "motherfucker",
];

// After this many warnings in a group, the member is removed (if the
// bot is an admin there).
const KICK_THRESHOLD = 3;

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/** Gets (creating if needed) the settings object for a group. Mutate the
 * returned object, then pass `data` to saveData() to persist it. */
function getGroupConfig(data, jid) {
  if (!data[jid]) {
    data[jid] = { enabled: false, words: [], warnings: {} };
  }
  // Backfill fields for configs saved by an older version of this file.
  if (!Array.isArray(data[jid].words)) data[jid].words = [];
  if (!data[jid].warnings) data[jid].warnings = {};
  return data[jid];
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `text` contains any word from the group's combined (default +
 * custom) list, matched on word boundaries so e.g. "class" doesn't trip
 * on "ass". */
function containsBadword(text, groupConfig) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const words = [...DEFAULT_BADWORDS, ...groupConfig.words];
  return words.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "i").test(lower));
}

/**
 * Checks an incoming group message against the civilguard filter and
 * takes action (delete + warn, or kick after repeated offenses) if
 * needed. Returns true if it acted on the message.
 *
 * Call this for every group message, not just ones starting with the
 * command prefix — the filter has to see normal chat to do anything.
 */
async function handleCivilguardDetection({ sock, jid, msg, text, senderJid, getGroupMetadata }) {
  if (!jid.endsWith("@g.us")) return false;
  if (!text) return false;

  const data = loadData();
  const groupConfig = getGroupConfig(data, jid);
  if (!groupConfig.enabled) return false;
  if (!containsBadword(text, groupConfig)) return false;

  const { senderIsAdmin, botIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
  // Don't moderate admins — they're trusted to police themselves.
  if (senderIsAdmin) return false;

  if (botIsAdmin) {
    try {
      await sock.sendMessage(jid, { delete: msg.key });
    } catch (_) {
      // message may already be gone — fine to ignore
    }
  }

  groupConfig.warnings[senderJid] = (groupConfig.warnings[senderJid] || 0) + 1;
  const count = groupConfig.warnings[senderJid];

  const mentionTag = `@${senderJid.split("@")[0]}`;

  if (count >= KICK_THRESHOLD && botIsAdmin) {
    groupConfig.warnings[senderJid] = 0;
    saveData(data);
    try {
      await sock.groupParticipantsUpdate(jid, [senderJid], "remove");
      await sock.sendMessage(jid, {
        text: `🚫 ${mentionTag} removed after repeated bad language.`,
        mentions: [senderJid],
      });
    } catch (_) {
      await sock.sendMessage(jid, {
        text: `⚠️ ${mentionTag} that was your ${count}${count === 1 ? "st" : count === 2 ? "nd" : "rd"} warning — I tried to remove you but couldn't.`,
        mentions: [senderJid],
      });
    }
  } else {
    saveData(data);
    await sock.sendMessage(jid, {
      text: `⚠️ ${mentionTag} watch your language. (${count}/${KICK_THRESHOLD} warnings)`,
      mentions: [senderJid],
    });
  }

  return true;
}

module.exports = {
  DEFAULT_BADWORDS,
  KICK_THRESHOLD,
  loadData,
  saveData,
  getGroupConfig,
  containsBadword,
  handleCivilguardDetection,
};
