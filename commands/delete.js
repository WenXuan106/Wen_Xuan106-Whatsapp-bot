module.exports = {
  name: "delete",
  description: "Delete a message — reply to it with !delete. Admins only in groups.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo?.stanzaId) {
      return sock.sendMessage(jid, { text: "Reply to the message you want deleted with !delete." });
    }

    if (jid.endsWith("@g.us")) {
      const { getGroupAdminStatus } = require("../lib/admin");
      const sender = msg.key.participant || msg.key.remoteJid;
      const { senderIsAdmin } = await getGroupAdminStatus(sock, jid, sender, getGroupMetadata);
      if (!senderIsAdmin) {
        return sock.sendMessage(jid, { text: "Only group admins can delete others' messages." });
      }
    }

    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe: false,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant,
      },
    });
  },
};
