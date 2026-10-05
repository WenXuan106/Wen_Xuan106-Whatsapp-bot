const fs = require("fs");
const path = require("path");

// Small persistent store the Telegram side needs because Telegram's Bot API
// (unlike WhatsApp's group metadata) can't list a group's members or look up
// a user by @username:
//   - users:       every user the bot has seen talk in a chat (id, name,
//                  username), used for !tagall and for resolving "@username"
//   - permissions: a group's normal member permissions, saved when !mute is
//                  used so !unmute can put them back exactly as they were
//   - chats:       the group chats the bot has been in (id -> title), so the
//                  website can list them for the on/off switch
const DATA_FILE = path.join(__dirname, "..", "data", "telegramState.json");

let state = null;
let saveTimer = null;

function load() {
  if (state) return state;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    state = {
      users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
      permissions: parsed.permissions && typeof parsed.permissions === "object" ? parsed.permissions : {},
      chats: parsed.chats && typeof parsed.chats === "object" ? parsed.chats : {},
    };
  } catch (_) {
    state = { users: {}, permissions: {}, chats: {} };
  }
  return state;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error("Failed to save Telegram state:", err.message);
    }
  }, 2000);
}

function displayName(user) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || String(user.id);
}

/** Remember a user seen in `chatId`. Only touches disk if something changed. */
function rememberUser(chatId, user) {
  if (!user || user.is_bot) return;
  const s = load();
  const chatKey = String(chatId);
  if (!s.users[chatKey]) s.users[chatKey] = {};
  const entry = {
    name: displayName(user),
    username: user.username ? user.username.toLowerCase() : null,
  };
  const prev = s.users[chatKey][String(user.id)];
  if (!prev || prev.gone || prev.name !== entry.name || prev.username !== entry.username) {
    s.users[chatKey][String(user.id)] = entry;
    scheduleSave();
  }
}

/** Mark a user as gone (left or kicked) so !tagall stops tagging them. Their
 * name is kept so messages that mention them right afterwards still read
 * properly; they come back automatically if they're seen in the chat again. */
function forgetUser(chatId, userId) {
  const s = load();
  const chatUsers = s.users[String(chatId)];
  const entry = chatUsers && chatUsers[String(userId)];
  if (entry && !entry.gone) {
    entry.gone = true;
    scheduleSave();
  }
}

/** Best-known display name for a user id, searching every chat (or just `chatId`). */
function getName(userId, chatId) {
  const s = load();
  const id = String(userId);
  if (chatId !== undefined && s.users[String(chatId)]?.[id]) return s.users[String(chatId)][id].name;
  for (const chatUsers of Object.values(s.users)) {
    if (chatUsers[id]) return chatUsers[id].name;
  }
  return null;
}

/** All user ids the bot has seen in `chatId`. */
function getChatUserIds(chatId) {
  const chatUsers = load().users[String(chatId)] || {};
  return Object.keys(chatUsers).filter((id) => !chatUsers[id].gone);
}

/** Resolve an "@username" (with or without the @) to a user id seen in `chatId`. */
function findByUsername(chatId, username) {
  const wanted = String(username || "").replace(/^@/, "").toLowerCase();
  if (!wanted) return null;
  const chatUsers = load().users[String(chatId)] || {};
  for (const [id, info] of Object.entries(chatUsers)) {
    if (!info.gone && info.username === wanted) return id;
  }
  return null;
}

function savePermissions(chatId, permissions) {
  load().permissions[String(chatId)] = permissions;
  scheduleSave();
}

function takePermissions(chatId) {
  const s = load();
  const perms = s.permissions[String(chatId)] || null;
  if (perms) {
    delete s.permissions[String(chatId)];
    scheduleSave();
  }
  return perms;
}

/** Remember a group chat's title. Only touches disk if something changed. */
function rememberChat(chatId, title) {
  const s = load();
  const key = String(chatId);
  const name = title || key;
  if (s.chats[key] !== name) {
    s.chats[key] = name;
    scheduleSave();
  }
}

/** Forget a group chat (the bot was removed from it). */
function forgetChat(chatId) {
  const s = load();
  if (s.chats[String(chatId)] !== undefined) {
    delete s.chats[String(chatId)];
    scheduleSave();
  }
}

/** { chatId: title } for every group the bot is in. */
function getChats() {
  return { ...load().chats };
}

module.exports = {
  rememberChat,
  forgetChat,
  getChats,
  rememberUser,
  forgetUser,
  getName,
  getChatUserIds,
  findByUsername,
  savePermissions,
  takePermissions,
};
