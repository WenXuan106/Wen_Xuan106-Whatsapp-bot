const config = require("../config");

// Which category each command belongs to, for the styled menu below.
// Anything not listed here still shows up, under "OTHER".
const CATEGORIES = {
  "🧭 GENERAL": ["help", "ping"],
  "🛡️ ADMIN": ["ban", "civilguard", "delete", "demote", "groupinfo", "kick", "mute", "promote", "tagall", "unban", "unmute", "warn", "warnings", "welcome"],
  "🎭 FUN": ["8ball", "answer", "coinflip", "dice", "hangman", "math", "meme", "rps", "scramble", "ship", "trivia", "ttt"],
  "🎞️ MEDIA": ["lyrics", "song", "status", "vocaloid"],
  "🌍 UTILITY": ["topmembers", "translate", "weather"],
  "👑 OWNER": ["stop"],
};

function box(lines) {
  const top = "┏━━━━━━━━━━━━━━━━━";
  const bottom = "┗━━━━━━━━━━━━━━━━━";
  return [top, ...lines.map((l) => `┃ ${l}`), bottom];
}

module.exports = {
  name: "help",
  description: "Show the command menu",
  async execute({ sock, msg, jid, commands }) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const categorized = new Set(Object.values(CATEGORIES).flat());
    const other = [...commands.keys()].filter((name) => !categorized.has(name));

    const lines = [];
    lines.push(`╭━━『 *${config.BOT_NAME}* 』━━╮`, "");
    lines.push(`👋 Hello @${sender.split("@")[0]}!`, "");
    lines.push(`⚡ Prefix: ${config.PREFIX}`);
    lines.push(`📦 Total Commands: ${commands.size}`);
    if (config.OWNER_NAME) lines.push(`👑 Owner: ${config.OWNER_NAME}`);
    lines.push("");

    for (const [category, names] of Object.entries(CATEGORIES)) {
      const present = names.filter((n) => commands.has(n));
      if (present.length === 0) continue;
      lines.push(...box([category]));
      for (const name of present) lines.push(`│ ➜ ${config.PREFIX}${name}`);
      lines.push("");
    }

    if (other.length > 0) {
      lines.push(...box(["🔧 OTHER"]));
      for (const name of other) lines.push(`│ ➜ ${config.PREFIX}${name}`);
      lines.push("");
    }

    lines.push("╰━━━━━━━━━━━━━━━━━");

    await sock.sendMessage(jid, { text: lines.join("\n"), mentions: [sender] }, { quoted: msg });
  },
};
