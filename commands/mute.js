const { getGroupAdminStatus } = require("../lib/admin");

module.exports = {
  name: "mute",
  description: "Restrict the group so only admins can send messages. Admins only.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin, botIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);

    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }
    if (!botIsAdmin) {
      return sock.sendMessage(jid, { text: "I need to be a group admin to do that." });
    }

    await sock.groupSettingUpdate(jid, "announcement");
    await sock.sendMessage(jid, { text: "Group muted — only admins can send messages now." });
  },
};
