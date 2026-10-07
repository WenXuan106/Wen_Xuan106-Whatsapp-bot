const { MAX_WARNINGS, getWarnings, removeWarning, clearWarnings } = require("../lib/warnings");

module.exports = {
  name: "unwarn",
  description: "Remove a warning from a member (reply or @mention): !unwarn @user for one, !unwarn @user all to clear them. Admins only.",
  aliases: ["clearwarn"],
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin && !ctx.isOwner()) {
      return ctx.sendText("Only group admins can use this command.");
    }

    const rawTarget = ctx.getTargetUser();
    if (!rawTarget) {
      return ctx.sendText(
        "Reply to the person's message or @mention them:\n" +
          "!unwarn @user — remove one warning\n" +
          "!unwarn @user all — clear all their warnings"
      );
    }

    // Same id form !warn stores warnings under.
    const target = await ctx.resolveMember(rawTarget);
    const tag = `@${ctx.shortId(target)}`;

    const before = getWarnings(ctx.chatId, target);
    if (before === 0) {
      return ctx.sendMention(`${tag} has no warnings.`, [target]);
    }

    const clearAll = ctx.args.some((a) => ["all", "clear"].includes(a.toLowerCase()));
    if (clearAll) {
      clearWarnings(ctx.chatId, target);
      return ctx.sendMention(`✅ Cleared all ${before} warning${before === 1 ? "" : "s"} for ${tag}.`, [target]);
    }

    const after = removeWarning(ctx.chatId, target);
    await ctx.sendMention(`✅ Removed a warning from ${tag}. Warnings: ${after}/${MAX_WARNINGS}`, [target]);
  },
};
