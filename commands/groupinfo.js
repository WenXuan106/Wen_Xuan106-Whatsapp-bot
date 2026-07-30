module.exports = {
  name: "groupinfo",
  description: "Show information about the current group.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const metadata = await getGroupMetadata(jid);
    const admins = metadata.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin"
    );
    const createdAt = metadata.creation
      ? new Date(metadata.creation * 1000).toLocaleDateString()
      : "Unknown";

    const lines = [
      `📌 *${metadata.subject}*`,
      "",
      `🆔 ID: ${jid}`,
      `👑 Owner: ${metadata.owner ? "@" + metadata.owner.split("@")[0] : "Unknown"}`,
      `📅 Created: ${createdAt}`,
      `👥 Members: ${metadata.participants.length}`,
      `🛡️ Admins: ${admins.length}`,
      "",
      metadata.desc ? `📝 Description:\n${metadata.desc}` : "📝 No description set.",
    ];

    const mentions = metadata.owner ? [metadata.owner] : [];
    await sock.sendMessage(jid, { text: lines.join("\n"), mentions }, { quoted: msg });
  },
};
