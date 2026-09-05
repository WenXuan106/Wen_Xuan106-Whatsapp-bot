const { Telegraf } = require("telegraf");
const config = require("../config");
const { loadCommands } = require("./commands");

const commands = loadCommands();

// Only commands confirmed to use the platform-agnostic ctx methods (no
// direct Baileys/WhatsApp-specific calls) run on Telegram. Everything
// else replies with a "not migrated yet" notice instead of erroring
// unpredictably — see the staged migration plan.
const TELEGRAM_READY_COMMANDS = new Set(["ping", "weather"]);

function buildTelegramContext(tgCtx, args) {
  const chatId = tgCtx.chat.id;
  const isGroup = tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup";
  const text = tgCtx.message?.text || "";
  const messageTimestampMs = tgCtx.message?.date ? tgCtx.message.date * 1000 : Date.now();

  return {
    platform: "telegram",
    chatId,
    senderId: String(tgCtx.from.id),
    isGroup,
    text,
    args,
    messageTimestampMs,

    async sendText(msgText) {
      return tgCtx.reply(msgText);
    },
    async sendImage(source, caption) {
      // source can be a Buffer (e.g. the rendered weather card) or a URL string.
      const media = Buffer.isBuffer(source) ? { source } : source;
      return tgCtx.replyWithPhoto(media, caption ? { caption } : undefined);
    },
    async sendSticker(buffer) {
      // Telegram is strict about sticker format (proper webp) — this is
      // best-effort using our existing WhatsApp-oriented sticker pipeline,
      // not guaranteed to work for every source image yet.
      return tgCtx.replyWithSticker({ source: buffer });
    },
    async reply(msgText) {
      return tgCtx.reply(msgText);
    },
  };
}

function startTelegramBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup.");
    return null;
  }

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on("text", async (tgCtx) => {
    const text = tgCtx.message.text || "";
    if (!text.startsWith(config.PREFIX)) return;

    const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    if (!TELEGRAM_READY_COMMANDS.has(command.name)) {
      await tgCtx.reply(`"${command.name}" isn't available on Telegram yet — still being migrated over from WhatsApp.`);
      return;
    }

    const platformCtx = buildTelegramContext(tgCtx, args);

    try {
      await command.execute(platformCtx);
    } catch (err) {
      console.error(`Error running Telegram command "${cmdName}":`, err);
      try {
        await tgCtx.reply("⚠️ Something went wrong running that command.");
      } catch (sendErr) {
        console.error("Also failed to send the Telegram error notice:", sendErr);
      }
    }
  });

  bot.launch();
  console.log("Telegram bot connected.");

  // Telegraf's recommended graceful-shutdown hooks.
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}

module.exports = { startTelegramBot };
