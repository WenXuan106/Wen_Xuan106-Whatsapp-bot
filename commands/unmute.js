module.exports = {
  name: "unmute",
  description: "Let everyone send messages again. Admins only.",
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
      await ctx.setGroupLocked(false);
    } catch (err) {
      console.error("unmute command failed:", err.message);
      return ctx.sendText("Couldn't unmute the group — check that I have permission to change group settings.");
    }
    await ctx.sendText("Group unmuted — everyone can send messages again.");
  },
};
