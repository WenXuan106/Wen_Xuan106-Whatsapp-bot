const { MAX_WARNINGS, getWarnings } = require("../lib/warnings");

module.exports = {
  name: "warnings",
  description: "Check a member's warning count (reply to them or @mention).",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const rawTarget = ctx.getTargetUser();
    if (!rawTarget) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !warnings @user");
    }
    // Same id form !warn and !unwarn store warnings under.
    const target = await ctx.resolveMember(rawTarget);

    const count = getWarnings(ctx.chatId, target);
    await ctx.sendMention(`👤 @${ctx.shortId(target)} has ${count}/${MAX_WARNINGS} warning(s).`, [target]);
  },
};
