const { MAX_WARNINGS, addWarning, clearWarnings } = require("../lib/warnings");

module.exports = {
  name: "warn",
  description: "Warn a member (reply to them or @mention). Auto-kicks after 3 warnings. Admins only.",
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

    const rawTarget = ctx.getTargetUser();
    if (!rawTarget) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !warn @user");
    }

    const sender = ctx.senderId;
    const target = await ctx.resolveMember(rawTarget);

    if (ctx.isBotId(target)) {
      return ctx.sendText("I can't warn myself.");
    }

    const count = addWarning(ctx.chatId, target);

    await ctx.sendMention(
      `⚠️ *Warning issued*\n\n` +
        `👤 User: @${ctx.shortId(target)}\n` +
        `📈 Warnings: ${count}/${MAX_WARNINGS}\n` +
        `👮 By: @${ctx.shortId(sender)}`,
      [target, sender]
    );

    if (count >= MAX_WARNINGS) {
      const ok = await ctx.removeMember(target);
      if (ok) clearWarnings(ctx.chatId, target);

      await ctx.sendMention(
        ok
          ? `🚫 @${ctx.shortId(target)} has been removed after reaching ${MAX_WARNINGS} warnings.`
          : `Reached ${MAX_WARNINGS} warnings, but the platform rejected the removal request.`,
        [target]
      );
    }
  },
};
