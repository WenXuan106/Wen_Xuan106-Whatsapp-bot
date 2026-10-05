const fs = require("fs");
const path = require("path");

// Remembers which group chats the bot has been switched OFF in (with
// "!bot off"), so the choice survives restarts. While a chat is off the bot
// ignores everything there — commands, games, civilguard, welcome messages —
// except "!bot on", which turns it back on.
const DATA_FILE = path.join(__dirname, "..", "data", "botswitch.json");

let disabled = null; // Set<string> of chat ids

function load() {
  if (disabled) return disabled;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    disabled = new Set(Array.isArray(parsed.disabled) ? parsed.disabled.map(String) : []);
  } catch (_) {
    disabled = new Set();
  }
  return disabled;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ disabled: [...load()] }, null, 2));
  } catch (err) {
    console.error("Failed to save bot on/off state:", err.message);
  }
}

/** True if the bot has been switched off in this chat. */
function isBotDisabled(chatId) {
  return load().has(String(chatId));
}

/** Switches the bot off (disabled = true) or back on in a chat. */
function setBotDisabled(chatId, isDisabled) {
  const set = load();
  const key = String(chatId);
  const changed = isDisabled ? !set.has(key) : set.has(key);
  if (isDisabled) set.add(key);
  else set.delete(key);
  if (changed) save();
  return changed;
}

/** Every chat id the bot is currently switched off in. */
function getDisabledIds() {
  return [...load()];
}

module.exports = { isBotDisabled, setBotDisabled, getDisabledIds };
