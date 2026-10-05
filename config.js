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

// Spotify PAI key, used by !weather command. Get free one at 
// developer.spotify.com/dashboard - without this set, !spotify
// will tell users the bot isn't configured.
SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",

//Telegram Bot Token
TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",

// Keeps the game points safe across redeploys on hosts that wipe the disk
// (like Render's free plan) by saving a copy in a private GitHub Gist.
// GITHUB_TOKEN: a *classic* personal access token with ONLY the "gist"
//   permission (github.com/settings/tokens). Never commit it.
// SCORES_GIST_ID: the id from your gist's URL — create a secret gist that
//   contains a file named scores.json with {"users":{}} in it.
// Leave both blank to keep the points only in data/scores.json.
GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
SCORES_GIST_ID: process.env.SCORES_GIST_ID || "",

// Password for the group on/off page on the website (/groups.html). Pick
// something long and private — anyone who has it can switch the bot on and
// off in your groups. Leave blank to turn that page off completely.
DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "",

// Your numeric Telegram user id (get it by messaging @userinfobot). Used for
// owner-only commands like !stop on Telegram. Leave blank to disable them there.
TELEGRAM_OWNER_ID: process.env.TELEGRAM_OWNER_ID || "",
};
