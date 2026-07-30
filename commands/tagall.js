const { getGroupAdminStatus } = require("../lib/admin");

module.exports = {
  name: "tagall",
  description: "Mention every member of the group, e.g. !tagall meeting starting now. Admins only.",
  async execute({ sock, msg, jid, args, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin, participants } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }

    const note = args.join(" ").trim();
    const mentions = participants.map((p) => p.id);

    const lines = [note ? `📢 ${note}` : "📢 Attention everyone!", ""];
    lines.push(...mentions.map((id) => `@${id.split("@")[0]}`));

    await sock.sendMessage(jid, { text: lines.join("\n"), mentions }, { quoted: msg });
  },
};
