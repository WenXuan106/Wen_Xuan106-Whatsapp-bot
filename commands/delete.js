module.exports = {
  name: "delete",
  description: "Delete a message — reply to it with !delete. Admins only in groups.",
  async execute(ctx) {
    if (!ctx.hasReply()) {
      return ctx.sendText("Reply to the message you want deleted with !delete.");
    }

    if (ctx.isGroup) {
      const { senderIsAdmin } = await ctx.getAdminStatus();
      if (!senderIsAdmin) {
        return ctx.sendText("Only group admins can delete others' messages.");
      }
    }

    const deleted = await ctx.deleteReplied();
    if (!deleted) {
      await ctx.sendText("❌ Couldn't delete that message — I may need admin rights with permission to delete messages.");
    }
  },
};
