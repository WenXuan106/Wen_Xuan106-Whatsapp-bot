const { MAX_GUESSES, getGame, startGame, stopGame, makeGuess, renderBoard } = require("../lib/wordle");

const HOW_TO =
  "🟩 right letter, right spot\n🟨 right letter, wrong spot\n⬜ letter not in the word\n\n" +
  "Guess with *!wordle <word>*, e.g. *!wordle crane*";

module.exports = {
  name: "wordle",
  description: "Wordle — !wordle to start, !wordle <word> to guess, !wordle stop to end.",
  async execute(ctx) {
    const arg = (ctx.args[0] || "").toLowerCase();

    // !wordle stop — only whoever started it, a group admin, or the owner
    if (arg === "stop") {
      const game = getGame(ctx.chatId);
      if (!game) return ctx.sendMention("No Wordle is running here. Start one with *!wordle*", []);

      let allowed = game.starterId === ctx.senderId || ctx.isOwner();
      if (!allowed && ctx.isGroup) allowed = (await ctx.getAdminStatus()).senderIsAdmin;
      if (!allowed) return ctx.sendText("Only whoever started the Wordle, a group admin, or the bot owner can stop it.");

      const word = stopGame(ctx.chatId);
      return ctx.sendMention(`🛑 Wordle stopped. The word was *${word.toUpperCase()}*.`, []);
    }

    // !wordle — start a game, or show the current board
    if (!arg) {
      const game = getGame(ctx.chatId);
      if (game) {
        return ctx.sendMention(`🟩 *WORDLE* 🟨\n\n${renderBoard(game)}\n\nGuess with *!wordle <word>*`, []);
      }
      startGame(ctx.chatId, ctx.senderId);
      return ctx.sendMention(
        `🟩 *WORDLE* 🟨\nGuess the secret 5-letter word in ${MAX_GUESSES} tries — everyone in the chat plays together!\n\n${HOW_TO}`,
        []
      );
    }

    // !wordle <word> — a guess
    const result = makeGuess(ctx.chatId, arg, ctx.senderId, ctx.senderName);

    if (result.error === "none") {
      return ctx.sendMention("No Wordle is running here. Start one with *!wordle*", []);
    }
    if (result.error === "format") {
      return ctx.sendText("A guess must be a 5-letter word, e.g. !wordle crane");
    }
    if (result.error === "unknown") {
      return ctx.sendText(`"${arg}" isn't in my word list — try another word. (That didn't use up a guess.)`);
    }
    if (result.error === "repeat") {
      return ctx.sendText(`"${arg}" was already guessed — try a different word.`);
    }

    if (result.won) {
      const tag = `@${ctx.shortId(ctx.senderId)}`;
      const count = result.game.guesses.length;
      return ctx.sendMention(
        `🟩 *WORDLE* 🟨\n\n${result.board}\n\n🎉 ${tag} got it in ${count} ${count === 1 ? "guess" : "guesses"}! The word was *${result.game.word.toUpperCase()}*.\n🏅 +${result.points} points`,
        [ctx.senderId]
      );
    }

    if (result.lost) {
      return ctx.sendMention(
        `🟩 *WORDLE* 🟨\n\n${result.board}\n\n💀 Out of guesses! The word was *${result.word.toUpperCase()}*.\nStart a new one with *!wordle*`,
        []
      );
    }

    await ctx.sendMention(`🟩 *WORDLE* 🟨\n\n${result.board}`, []);
  },
};
