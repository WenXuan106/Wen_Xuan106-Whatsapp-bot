const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "warnings.json");

// Warnings above this count trigger an auto-kick in !warn.
const MAX_WARNINGS = 3;

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAll() {
  ensureDataDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveAll(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/** Warning count for `jid` within `groupJid`. */
function getWarnings(groupJid, jid) {
  const all = loadAll();
  return all[groupJid]?.[jid] || 0;
}

/** Adds one warning for `jid` within `groupJid`. Returns the new count. */
function addWarning(groupJid, jid) {
  const all = loadAll();
  if (!all[groupJid]) all[groupJid] = {};
  all[groupJid][jid] = (all[groupJid][jid] || 0) + 1;
  saveAll(all);
  return all[groupJid][jid];
}

/** Clears warnings for `jid` within `groupJid` (e.g. after an auto-kick). */
function clearWarnings(groupJid, jid) {
  const all = loadAll();
  if (all[groupJid]) {
    delete all[groupJid][jid];
    saveAll(all);
  }
}

module.exports = { MAX_WARNINGS, getWarnings, addWarning, clearWarnings };
