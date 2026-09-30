module.exports = {
  name: "demote",
  description: "Remove a member's admin status (reply to them or @mention). Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin, botIsAdmin } = await ctx.getAdminStatus();

    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }
    if (!botIsAdmin) {
      return ctx.sendText("I need to be a group admin to do that.");
    }

    const target = ctx.getTargetUser();
    if (!target) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !demote @user");
    }

    const ok = await ctx.setMemberAdmin(target, false);
    await ctx.sendText(ok ? "Done." : "Couldn't demote that member — the platform rejected the request.");
  },
};
