module.exports = {
  // Prefix used to trigger commands, e.g. "!ping"
  PREFIX: process.env.PREFIX || "!",

  // Port for the pairing website + status API
  PORT: process.env.PORT || 3000,

  // Folder where WhatsApp session credentials are stored.
  // Keep this folder private — anyone with it can control your WhatsApp account.
  AUTH_FOLDER: process.env.AUTH_FOLDER || "auth_info_baileys",

  // Your bot's display name in some client UIs
  BOT_NAME: process.env.BOT_NAME || "Wen_Xuan106’s Whatsapp bot",

  // Shown as "Owner" in the .help / .menu command
  OWNER_NAME: process.env.OWNER_NAME || "",

  // Optional: digits-only phone number (with country code, no "+") that
  // should also count as "the owner" for owner-only commands like !stop,
  // in addition to messages sent from the bot's own linked account
  // (fromMe). Leave blank if the fromMe check alone is enough for you.
  OWNER_NUMBER: process.env.OWNER_NUMBER || "",

  // Official OpenAI API key, used by the !gpt command. Get one at
  // https://platform.openai.com/api-keys — without this set, !gpt will
  // tell users the bot isn't configured instead of trying (and failing)
  // to reach a free proxy.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  // Model used by !gpt. gpt-4o-mini is a good cost/quality default.
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",

  // OpenWeatherMap API key, used by the !weather command. Get a free one at
  // https://home.openweathermap.org/api_keys — without this set, !weather
  // will tell users the bot isn't configured.
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || "",
};
