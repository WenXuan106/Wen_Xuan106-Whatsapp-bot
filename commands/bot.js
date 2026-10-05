const { isBotDisabled, setBotDisabled } = require("../lib/botswitch");

module.exports = {
  name: "bot",
  description: "Switch the bot on/off in this group: !bot off, !bot on, or !bot to see the current state. Admins and the owner only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const sub = (ctx.args[0] || "").toLowerCase();
    const currentlyOff = isBotDisabled(ctx.chatId);

    if (!sub || sub === "status") {
      return ctx.sendText(
        currentlyOff
          ? "🔴 The bot is OFF in this group. An admin can turn it back on with !bot on"
          : "🟢 The bot is ON in this group. An admin can switch it off with !bot off"
      );
    }

    if (sub !== "on" && sub !== "off") {
      return ctx.sendText("Usage: !bot on, !bot off, or !bot to see the current state.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin && !ctx.isOwner()) {
      return ctx.sendText("Only group admins (or the bot owner) can switch the bot on or off here.");
    }

    if (sub === "off") {
      if (currentlyOff) return ctx.sendText("🔴 The bot is already OFF in this group.");
      setBotDisabled(ctx.chatId, true);
      return ctx.sendText("🔴 Bot switched OFF in this group. I'll ignore everything here until an admin sends !bot on");
    }

    if (!currentlyOff) return ctx.sendText("🟢 The bot is already ON in this group.");
    setBotDisabled(ctx.chatId, false);
    await ctx.sendText("🟢 Bot switched back ON in this group.");
  },
};
