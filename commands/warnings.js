const { MAX_WARNINGS, getWarnings } = require("../lib/warnings");

module.exports = {
  name: "warnings",
  description: "Check a member's warning count (reply to them or @mention).",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const target = ctx.getTargetUser();
    if (!target) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !warnings @user");
    }

    const count = getWarnings(ctx.chatId, target);
    await ctx.sendMention(`👤 @${ctx.shortId(target)} has ${count}/${MAX_WARNINGS} warning(s).`, [target]);
  },
};
