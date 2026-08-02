const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "welcome.json");

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

function getSettings(jid) {
  const data = loadData();
  return data[jid] || { enabled: false, message: null };
}

function setEnabled(jid, enabled) {
  const data = loadData();
  if (!data[jid]) data[jid] = { enabled: false, message: null };
  data[jid].enabled = enabled;
  saveData(data);
}

function setMessage(jid, message) {
  const data = loadData();
  if (!data[jid]) data[jid] = { enabled: false, message: null };
  data[jid].message = message;
  saveData(data);
}

/**
 * Builds the greeting text for a new member, substituting {user} and
 * {group}. Falls back to a plain default when no custom message is set.
 */
function buildMessage(settings, userJid, groupName) {
  const mention = `@${userJid.split("@")[0]}`;
  if (settings.message) {
    return settings.message.replace(/{user}/g, mention).replace(/{group}/g, groupName);
  }
  return `👋 Welcome ${mention} to *${groupName}*! Glad to have you here.`;
}

/**
 * Called from the group-participants.update handler when members join.
 * Sends a greeting for each new participant if welcome is enabled for
 * this group.
 */
async function handleJoin({ sock, jid, participants }) {
  const settings = getSettings(jid);
  if (!settings.enabled) return;

  let groupName = jid;
  try {
    const metadata = await sock.groupMetadata(jid);
    groupName = metadata.subject || jid;
  } catch (_) {
    // fall back to jid if metadata fetch fails
  }

  for (const userJid of participants) {
    try {
      await sock.sendMessage(jid, {
        text: buildMessage(settings, userJid, groupName),
        mentions: [userJid],
      });
    } catch (err) {
      console.error("Error sending welcome message:", err);
    }
  }
}

module.exports = { getSettings, setEnabled, setMessage, handleJoin };
