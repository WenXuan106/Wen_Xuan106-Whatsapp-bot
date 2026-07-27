const { getGroupAdminStatus } = require("../lib/admin");

module.exports = {
  name: "unmute",
  description: "Let everyone send messages again. Admins only.",
  async execute({ sock, msg, jid }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const sender = msg.key.participant || msg.key.remoteJid;
    const { senderIsAdmin, botIsAdmin } = await getGroupAdminStatus(sock, jid, sender);

    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }
    if (!botIsAdmin) {
      return sock.sendMessage(jid, { text: "I need to be a group admin to do that." });
    }

    await sock.groupSettingUpdate(jid, "not_announcement");
    await sock.sendMessage(jid, { text: "Group unmuted — everyone can send messages again." });
  },
};
