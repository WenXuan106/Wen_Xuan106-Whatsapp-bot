const { getGame, passPotato } = require("../lib/potato");

module.exports = {
  name: "pass",
  description: "Pass the hot potato to someone (reply to them or @mention): !pass @user",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("Hot potato only works in groups.");
    }

    if (!getGame(ctx.chatId)) {
      return ctx.sendText("There's no hot potato in play — start one with !potato");
    }

    const rawTarget = ctx.getTargetUser();
    if (!rawTarget) {
      return ctx.sendText("Who do you want to pass it to? Reply to their message or @mention them: !pass @user");
    }

    // Same id form the sender's own messages use, so the receiver can pass it on later.
    const target = await ctx.resolveMember(rawTarget);

    if (ctx.isBotId(target)) {
      return ctx.sendText("I don't want it — it'll explode on me! 💥 Pass it to a person.");
    }

    const result = passPotato(ctx.chatId, ctx.senderId, target, (text, ids) => ctx.sendMention(text, ids));

    if (result.error === "notHolder") {
      return ctx.sendMention(`🥔 You're not holding it — @${ctx.shortId(result.holderId)} is!`, [result.holderId]);
    }
    if (result.error === "self") {
      return ctx.sendText("You can't pass it to yourself! Pick someone else.");
    }
    if (result.error) {
      return ctx.sendText("There's no hot potato in play — start one with !potato");
    }

    await ctx.sendMention(
      `🥔 @${ctx.shortId(ctx.senderId)} passed the hot potato to @${ctx.shortId(target)}! Pass it on quick! 🔥`,
      [ctx.senderId, target]
    );
  },
};
