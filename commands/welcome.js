const { getSettings, setEnabled, setMessage } = require("../lib/welcome");

module.exports = {
  name: "welcome",
  description: "Manage the join greeting: !welcome on/off, or !welcome set <message with {user} {group}>. Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }

    // Settings are stored per chat, keyed by the chat id as a string.
    const chatKey = String(ctx.chatId);
    const sub = (ctx.args[0] || "").toLowerCase();

    if (sub === "on") {
      setEnabled(chatKey, true);
      return ctx.sendText("✅ Welcome messages turned on.");
    }

    if (sub === "off") {
      setEnabled(chatKey, false);
      return ctx.sendText("🚫 Welcome messages turned off.");
    }

    if (sub === "set") {
      const message = ctx.args.slice(1).join(" ").trim();
      if (!message) {
        return ctx.sendText("Usage: !welcome set <message>\nUse {user} and {group} as placeholders.");
      }
      setMessage(chatKey, message);
      return ctx.sendText("✅ Custom welcome message saved.");
    }

    const settings = getSettings(chatKey);
    await ctx.sendText(
      `👋 Welcome messages: *${settings.enabled ? "ON" : "OFF"}*\n` +
        `Message: ${settings.message || "(default)"}\n\n` +
        `Usage:\n!welcome on\n!welcome off\n!welcome set <message with {user} {group}>`
    );
  },
};
