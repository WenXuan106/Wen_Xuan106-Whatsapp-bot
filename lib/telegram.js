const { Telegraf } = require("telegraf");
const config = require("../config");
const { loadCommands } = require("./commands");
const { handleScrambleGuess } = require("./scramble");
const { handleMathAnswer } = require("./mathquiz");

const commands = loadCommands();

// Only commands confirmed to use the platform-agnostic ctx methods (no
// direct Baileys/WhatsApp-specific calls) run on Telegram. Everything
// else replies with a "not migrated yet" notice instead of erroring
// unpredictably — see the staged migration plan.
const TELEGRAM_READY_COMMANDS = new Set([
  "ping",
  "weather",
  "8ball",
  "coinflip",
  "dice",
  "rps",
  "trivia",
  "geography",
  "science",
  "answer",
  "song",
  "spotify",
  "vocaloid",
  "anime",
  "scramble",
  "math",
]);

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

// bot.launch() can reject (network timeout reaching api.telegram.org, a
// transient blip, etc.) — retry with backoff instead of giving up after
// one failure. This never throws; a permanent failure just logs and
// leaves Telegram disconnected without affecting WhatsApp.
async function launchWithRetry(bot, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await bot.launch();
      console.log("Telegram bot connected.");
      return;
    } catch (err) {
      lastErr = err;
      const delayMs = Math.min(30000, 2000 * 2 ** (i - 1));
      console.error(
        `Telegram launch attempt ${i}/${attempts} failed (${err.message}), retrying in ${delayMs}ms…`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error("Telegram bot failed to start after several attempts (WhatsApp is unaffected):", lastErr?.message);
}

function startTelegramBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup.");
    return null;
  }

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on("text", async (tgCtx) => {
    const text = tgCtx.message.text || "";
    const chatId = tgCtx.chat.id;

    // Same idea as WhatsApp's civilguard/game hook — scramble/math need
    // to see plain guesses ("computer", "42"), not just "!" commands.
    // This runs before the prefix check below.
    try {
      const sendTextForGames = (t) => tgCtx.reply(t);

      const scrambleHandled = await handleScrambleGuess({ chatId, text, sendText: sendTextForGames });
      if (scrambleHandled) return;

      const mathHandled = await handleMathAnswer({ chatId, text, sendText: sendTextForGames });
      if (mathHandled) return;
    } catch (err) {
      console.error("Telegram game move handling error:", err);
    }

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

  // bot.launch() returns a promise that can reject (e.g. a network
  // timeout reaching api.telegram.org, an invalid token). Without
  // catching that, a Telegram-side problem crashed the ENTIRE process —
  // taking the WhatsApp bot down with it. launchWithRetry never throws,
  // and retries transient failures instead of giving up immediately.
  launchWithRetry(bot);
  console.log("Telegram bot starting…");

  // Telegraf's recommended graceful-shutdown hooks.
  // Guarded: bot.stop() throws synchronously if the bot never finished
  // launching (e.g. still mid-retry when a shutdown signal arrives) —
  // uncaught inside a signal handler, that crashes the whole process.
  process.once("SIGINT", () => {
    try {
      bot.stop("SIGINT");
    } catch (err) {
      console.error("Telegram bot.stop() on SIGINT failed (harmless if it was never running):", err.message);
    }
  });
  process.once("SIGTERM", () => {
    try {
      bot.stop("SIGTERM");
    } catch (err) {
      console.error("Telegram bot.stop() on SIGTERM failed (harmless if it was never running):", err.message);
    }
  });

  return bot;
}

module.exports = { startTelegramBot };
