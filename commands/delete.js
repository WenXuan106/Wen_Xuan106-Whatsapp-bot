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
      const { senderIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
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
