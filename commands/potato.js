const { MIN_PLAYERS_TO_SCORE, getGame, startGame, stopGame } = require("../lib/potato");

module.exports = {
  name: "potato",
  description: "Hot potato — !potato to start, pass it with !pass @user before it explodes. !potato stop to end.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("Hot potato needs a group — add me to one and try again!");
    }

    const arg = (ctx.args[0] || "").toLowerCase();

    if (arg === "stop") {
      const game = getGame(ctx.chatId);
      if (!game) return ctx.sendText("No hot potato is in play.");

      let allowed = game.starterId === ctx.senderId || ctx.isOwner();
      if (!allowed) allowed = (await ctx.getAdminStatus()).senderIsAdmin;
      if (!allowed) return ctx.sendText("Only whoever started the game, a group admin, or the bot owner can stop it.");

      stopGame(ctx.chatId);
      return ctx.sendText("🛑 Hot potato stopped — nobody gets burned.");
    }

    const existing = getGame(ctx.chatId);
    if (existing) {
      return ctx.sendMention(
        `🥔 @${ctx.shortId(existing.holderId)} is holding the hot potato right now! Pass it with *!pass @user*`,
        [existing.holderId]
      );
    }

    startGame(ctx.chatId, ctx.senderId, ctx.senderName, (text, ids) => ctx.sendMention(text, ids), (id) => ctx.shortId(id));

    await ctx.sendMention(
      `🥔🔥 *HOT POTATO!* 🔥🥔\n\n@${ctx.shortId(ctx.senderId)} is holding the hot potato!\n\n` +
        `Pass it on with *!pass @user* (or reply to someone's message with *!pass*) before it explodes. 💣\n` +
        `Whoever is holding it when it blows up loses — everyone else who touched it wins points ` +
        `(${MIN_PLAYERS_TO_SCORE}+ players needed).`,
      [ctx.senderId]
    );
  },
};
