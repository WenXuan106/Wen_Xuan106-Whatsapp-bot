const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "messageCounts.json");

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCounts() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function saveCounts(counts) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(counts, null, 2));
}

/** Bumps `userJid`'s message count in `groupJid` by one. */
function incrementCount(groupJid, userJid) {
  const counts = loadCounts();
  if (!counts[groupJid]) counts[groupJid] = {};
  counts[groupJid][userJid] = (counts[groupJid][userJid] || 0) + 1;
  saveCounts(counts);
}

/** Returns the top `limit` [jid, count] pairs for `groupJid`, sorted descending. */
function getTop(groupJid, limit = 5) {
  const counts = loadCounts();
  const groupCounts = counts[groupJid] || {};
  return Object.entries(groupCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

module.exports = { incrementCount, getTop };
