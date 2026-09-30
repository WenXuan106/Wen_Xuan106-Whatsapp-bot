module.exports = {
  name: "kick",
  description: "Remove a member from the group (reply to them or @mention). Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin, botIsAdmin } = await ctx.getAdminStatus();

    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }
    if (!botIsAdmin) {
      return ctx.sendText("I need to be a group admin to remove members.");
    }

    const target = ctx.getTargetUser();
    if (!target) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !kick @user");
    }

    const ok = await ctx.removeMember(target);
    await ctx.sendText(ok ? "Done." : "Couldn't remove that member — the platform rejected the request.");
  },
};
