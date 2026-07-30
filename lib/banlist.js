const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "banned.json");

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadBanned() {
  ensureDataDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveBanned(list) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

/** True if `jid` is on the bot-wide ban list (blocked from using any command). */
function isBanned(jid) {
  if (!jid) return false;
  return loadBanned().includes(jid);
}

/** Adds `jid` to the ban list. Returns false if already banned. */
function addBanned(jid) {
  const list = loadBanned();
  if (list.includes(jid)) return false;
  list.push(jid);
  saveBanned(list);
  return true;
}

/** Removes `jid` from the ban list. Returns false if it wasn't there. */
function removeBanned(jid) {
  const list = loadBanned();
  const index = list.indexOf(jid);
  if (index === -1) return false;
  list.splice(index, 1);
  saveBanned(list);
  return true;
}

module.exports = { isBanned, addBanned, removeBanned };
