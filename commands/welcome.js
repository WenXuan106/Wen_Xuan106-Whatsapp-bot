const { getGroupAdminStatus } = require("../lib/admin");
const { getSettings, setEnabled, setMessage } = require("../lib/welcome");

module.exports = {
  name: "welcome",
  description: "Manage the join greeting: !welcome on/off, or !welcome set <message with {user} {group}>. Admins only.",
  async execute({ sock, msg, jid, args, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }

    const sub = (args[0] || "").toLowerCase();

    if (sub === "on") {
      setEnabled(jid, true);
      return sock.sendMessage(jid, { text: "✅ Welcome messages turned on." });
    }

    if (sub === "off") {
      setEnabled(jid, false);
      return sock.sendMessage(jid, { text: "🚫 Welcome messages turned off." });
    }

    if (sub === "set") {
      const message = args.slice(1).join(" ").trim();
      if (!message) {
        return sock.sendMessage(jid, {
          text: "Usage: !welcome set <message>\nUse {user} and {group} as placeholders.",
        });
      }
      setMessage(jid, message);
      return sock.sendMessage(jid, { text: "✅ Custom welcome message saved." });
    }

    const settings = getSettings(jid);
    await sock.sendMessage(jid, {
      text:
        `👋 Welcome messages: *${settings.enabled ? "ON" : "OFF"}*\n` +
        `Message: ${settings.message || "(default)"}\n\n` +
        `Usage:\n!welcome on\n!welcome off\n!welcome set <message with {user} {group}>`,
    });
  },
};
