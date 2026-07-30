module.exports = {
  // Prefix used to trigger commands, e.g. "!ping"
  PREFIX: process.env.PREFIX || "!",

  // Port for the pairing website + status API
  PORT: process.env.PORT || 3000,

  // Folder where WhatsApp session credentials are stored.
  // Keep this folder private — anyone with it can control your WhatsApp account.
  AUTH_FOLDER: process.env.AUTH_FOLDER || "auth_info_baileys",

  // Your bot's display name in some client UIs
  BOT_NAME: process.env.BOT_NAME || "Wen_Xuan106's Whatsapp Bot",

  // Shown as "Owner" in the .help / .menu command
  OWNER_NAME: process.env.OWNER_NAME || "",

  // Optional: digits-only phone number (with country code, no "+") that
  // should also count as "the owner" for owner-only commands like !stop,
  // in addition to messages sent from the bot's own linked account
  // (fromMe). Leave blank if the fromMe check alone is enough for you.
  OWNER_NUMBER: process.env.OWNER_NUMBER || "",
};
