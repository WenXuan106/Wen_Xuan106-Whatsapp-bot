module.exports = {
  name: "mute",
  description: "Restrict the group so only admins can send messages. Admins only.",
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

    try {
      await ctx.setGroupLocked(true);
    } catch (err) {
      console.error("mute command failed:", err.message);
      return ctx.sendText("Couldn't mute the group — check that I have permission to change group settings.");
    }
    await ctx.sendText("Group muted — only admins can send messages now.");
  },
};
