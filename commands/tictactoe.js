const { startGame, stopGame } = require("../lib/tictactoe");

module.exports = {
  name: "ttt",
  description: "Tic-tac-toe — !ttt to start (you're X), first other player to move is O. Type 1-9 to place. !ttt stop to end.",
  async execute(ctx) {
    if ((ctx.args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(ctx.chatId);
      return ctx.sendText(stopped ? "🛑 Tic-tac-toe stopped." : "No game is currently running.");
    }

    const result = startGame(ctx.chatId, ctx.senderId);
    if (result.error) {
      return ctx.sendText(result.error);
    }

    await ctx.sendText(`⭕ *Tic-Tac-Toe*\nYou're X. Type 1-9 to place.\n\n${result.board}`);
  },
};
