const { removeBanned } = require("../lib/banlist");

module.exports = {
  name: "unban",
  description: "Let a banned member use bot commands again (reply to them or @mention). Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }

    const target = ctx.getTargetUser();
    if (!target) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !unban @user");
    }

    const tag = `@${ctx.shortId(target)}`;
    const removed = removeBanned(target);
    await ctx.sendMention(removed ? `✅ ${tag} has been unbanned.` : `${tag} isn't banned.`, [target]);
  },
};
