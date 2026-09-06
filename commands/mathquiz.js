const { startGame, stopGame } = require("../lib/mathquiz");

module.exports = {
  name: "math",
  description: "Quick math quiz — !math to start, type the answer to win. !math stop to end.",
  async execute(ctx) {
    if ((ctx.args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(ctx.chatId);
      return ctx.sendText(stopped ? "🛑 Math quiz stopped." : "No round is currently running.");
    }

    const result = startGame(ctx.chatId, (text) => ctx.sendText(text));
    if (result.error) {
      return ctx.sendText(result.error);
    }

    await ctx.sendText(`🧮 *Math Quiz*\n${result.question} = ?\n\nFirst correct answer wins. 30s. *!math stop* to end.`);
  },
};
