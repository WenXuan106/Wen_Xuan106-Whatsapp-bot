const { startGame, stopGame } = require("../lib/hangman");

module.exports = {
  name: "hangman",
  description: "Hangman — !hangman to start, type a letter to guess. !hangman stop to end.",
  async execute(ctx) {
    if ((ctx.args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(ctx.chatId);
      return ctx.sendText(stopped ? "🛑 Hangman stopped." : "No game is currently running.");
    }

    const result = startGame(ctx.chatId);
    if (result.error) {
      return ctx.sendText(result.error);
    }

    await ctx.sendText(`🪢 *Hangman*\n${result.stage}\n${result.display}\n\nGuess a letter. *!hangman stop* to end.`);
  },
};
