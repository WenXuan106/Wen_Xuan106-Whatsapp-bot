const { startGame, stopGame } = require("../lib/scramble");

module.exports = {
  name: "scramble",
  description: "Word scramble game — !scramble to start, type the unscrambled word to win. !scramble stop to end.",
  async execute(ctx) {
    if ((ctx.args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(ctx.chatId);
      return ctx.sendText(stopped ? "🛑 Scramble round stopped." : "No round is currently running.");
    }

    const result = startGame(ctx.chatId, (text) => ctx.sendText(text));
    if (result.error) {
      return ctx.sendText(result.error);
    }

    await ctx.sendText(
      `🔤 *Word Scramble*\nUnscramble this: *${result.scrambled}*\n\nType your answer. A hint drops in 20s. *!scramble stop* to end.`
    );
  },
};
