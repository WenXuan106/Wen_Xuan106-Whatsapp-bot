const config = require("../config");

// The !help menu is split into numbered sections. "!help" shows the list of
// sections; "!1", "!2", ... (or "!help admin") open one section in its own
// message with every command in it.
//
// To put a command in a section, add its name to that section's `commands`
// list. Commands that aren't in any section show up in an "OTHER" section at
// the end. Sections with no loaded commands are skipped, and the numbers
// adjust automatically.
const SECTIONS = [
  { title: "GENERAL", icon: "🧭", commands: ["help", "ping", "milo", "profile", "pfp"] },
  {
    title: "ADMIN",
    icon: "🛡️",
    commands: ["bot", "kick", "promote", "demote", "warn", "unwarn", "warnings", "ban", "unban", "mute", "unmute", "delete", "tagall", "groupinfo", "welcome", "civilguard"],
  },
  { title: "GAMES", icon: "🎮", commands: ["trivia", "geography", "science", "answer", "math", "scramble", "hangman", "ttt", "rps", "wordle", "potato", "pass"] },
  { title: "FUN", icon: "🎭", commands: ["8ball", "coinflip", "dice", "ship", "ash", "meme"] },
  { title: "MEDIA", icon: "🎞️", commands: ["anime", "song", "spotify", "video", "lyrics", "vocaloid", "tts", "attp", "status"] },
  { title: "AI", icon: "🤖", commands: ["gpt", "gemini"] },
  { title: "UTILITY", icon: "🌍", commands: ["weather", "translate", "topmembers"] },
  { title: "OWNER", icon: "👑", commands: ["stop"] },
];

// What each command shows in its section: [how to type it, one-line summary].
// A command missing from this list still appears, using the first part of its
// own `description`.
const INFO = {
  help: ["[section]", "Show this menu"],
  ping: ["", "Check the bot is alive"],
  milo: ["", "Check the bot is alive"],
  profile: ["[@user]", "Level, points and wins card"],
  pfp: ["[@user]", "Get a profile picture"],

  bot: ["on|off", "Switch the bot on or off in this group"],
  kick: ["@user", "Remove a member"],
  promote: ["@user", "Make someone an admin"],
  demote: ["@user", "Remove someone's admin rights"],
  warn: ["@user", "Warn a member (3 warnings = removed)"],
  unwarn: ["@user [all]", "Remove one warning (or all of them)"],
  warnings: ["@user", "Check someone's warnings"],
  ban: ["@user", "Block someone from using the bot"],
  unban: ["@user", "Let them use the bot again"],
  mute: ["", "Only admins can send messages"],
  unmute: ["", "Let everyone send messages again"],
  delete: ["(reply)", "Delete the message you reply to"],
  tagall: ["[message]", "Mention every member"],
  groupinfo: ["", "Info about this group"],
  welcome: ["on|off|set", "Greeting for new members"],
  civilguard: ["on|off|add|remove", "Bad-word filter"],

  trivia: ["", "Random trivia question"],
  geography: ["", "Geography question"],
  science: ["", "Science question"],
  answer: ["<answer>", "Answer the current question"],
  math: ["", "Quick math quiz"],
  scramble: ["", "Unscramble the word"],
  hangman: ["", "Guess the word letter by letter"],
  ttt: ["", "Tic-tac-toe with a friend"],
  rps: ["<rock|paper|scissors>", "Play against the bot"],
  wordle: ["[word]", "Guess the secret 5-letter word together"],
  potato: ["", "Hot potato — pass it before it explodes"],
  pass: ["@user", "Pass the hot potato to someone"],

  "8ball": ["<question>", "Ask the magic 8-ball"],
  coinflip: ["", "Flip a coin"],
  dice: ["", "Roll a die"],
  ship: ["<name>, <name>", "How well do two people match?"],
  ash: ["", "Says something random"],
  meme: ["", "Get a random meme"],

  anime: ["<name>", "Search anime, characters, reactions"],
  song: ["<name>", "Find a song on YouTube"],
  spotify: ["<song>", "Find a song on Spotify"],
  video: ["<search>", "Search YouTube videos"],
  lyrics: ["<song>", "Look up song lyrics"],
  vocaloid: ["<name>", "Search Vocaloid songs and characters"],
  tts: ["[lang] <text>", "Text to speech voice note"],
  attp: ["<text>", "Blinking-text sticker"],
  status: ["<text>", "Post a WhatsApp Status (WhatsApp only)"],

  gpt: ["<question>", "Ask OpenAI's GPT"],
  gemini: ["<question>", "Ask Google's Gemini"],

  weather: ["<city>", "Weather card + 3-day outlook"],
  translate: ["<language> <text>", "Translate text"],
  topmembers: ["", "Most active members here"],

  stop: ["", "Shut the bot down"],
};

function commandInfo(command) {
  if (INFO[command.name]) return INFO[command.name];
  const firstPart = String(command.description || "").split(/\.\s|\s—\s|\s\(/)[0].trim();
  return ["", firstPart.length > 50 ? firstPart.slice(0, 47) + "…" : firstPart];
}

// The sections that actually have commands right now, in order.
function buildSections(commands) {
  // `commands` also holds aliases (like "1", "2"), so only keep each command under its real name.
  const real = new Map([...commands].filter(([key, cmd]) => cmd.name.toLowerCase() === key));
  const placed = new Set();
  const sections = [];

  for (const section of SECTIONS) {
    const present = section.commands.filter((name) => real.has(name));
    present.forEach((name) => placed.add(name));
    if (present.length > 0) sections.push({ ...section, commands: present.map((name) => real.get(name)) });
  }

  const other = [...real.keys()].filter((name) => !placed.has(name)).sort();
  if (other.length > 0) {
    sections.push({ title: "OTHER", icon: "📦", commands: other.map((name) => real.get(name)) });
  }

  return { sections, totalCommands: real.size };
}

function menuMessage(ctx, sections, totalCommands) {
  const p = config.PREFIX;
  const lines = [];
  lines.push(`╭━━『 *${config.BOT_NAME}* 』━━╮`, "");
  lines.push(`👋 Hello @${ctx.shortId(ctx.senderId)}!`);
  lines.push(`⚡ Prefix: ${p}   •   📦 ${totalCommands} commands`);
  if (config.OWNER_NAME) lines.push(`👑 Owner: ${config.OWNER_NAME}`);
  lines.push("", "━━━━━━━━━━━━━━━━━", "📖 *MENU* — send a number", "━━━━━━━━━━━━━━━━━", "");
  sections.forEach((section, i) => lines.push(`${p}${i + 1}  ${section.icon} *${section.title}*`));
  lines.push("", `💡 ${p}1 opens ${sections[0].title} • ${p}help ${sections[0].title.toLowerCase()} works too`);
  return lines.join("\n");
}

function sectionMessage(section) {
  const p = config.PREFIX;
  const lines = [];
  lines.push(`╭━━『 ${section.icon} *${section.title}* 』━━╮`, "");
  for (const command of section.commands) {
    const [usage, summary] = commandInfo(command);
    lines.push(`▪️ *${p}${command.name}*${usage ? " " + usage : ""}`);
    if (summary) lines.push(`   └ ${summary}`);
  }
  lines.push("", `↩️ Send ${p}help for the menu`);
  return lines.join("\n");
}

module.exports = {
  name: "help",
  description: "Show the command menu — then !1, !2, ... open each section",
  // "!1" to "!9" open the matching section of the menu (see execute below).
  aliases: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  async execute(ctx) {
    const { sections, totalCommands } = buildSections(ctx.commands);
    const p = config.PREFIX;

    // Which section was asked for? "!3", or "!help 3" / "!help admin".
    let wanted = null;
    if (/^\d+$/.test(ctx.commandName || "")) {
      wanted = ctx.commandName;
    } else if (ctx.args[0]) {
      wanted = ctx.args[0].toLowerCase();
    }

    if (wanted === null) {
      return ctx.sendMention(menuMessage(ctx, sections, totalCommands), [ctx.senderId]);
    }

    const section = /^\d+$/.test(wanted)
      ? sections[parseInt(wanted, 10) - 1]
      : sections.find((s) => s.title.toLowerCase() === wanted);

    if (!section) {
      return ctx.sendMention(`❌ There's no section "${wanted}". Send ${p}help to see the menu.`, []);
    }

    await ctx.sendMention(sectionMessage(section), []);
  },
};
