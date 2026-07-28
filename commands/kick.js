const { getGroupAdminStatus, getMentionedJid, getQuotedParticipant } = require("../lib/admin");

module.exports = {
  name: "kick",
  description: "Remove a member from the group (reply to them or @mention). Admins only.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const sender = msg.key.participant || msg.key.remoteJid;
    const { senderIsAdmin, botIsAdmin } = await getGroupAdminStatus(sock, jid, sender, getGroupMetadata);

    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }
    if (!botIsAdmin) {
      return sock.sendMessage(jid, { text: "I need to be a group admin to remove members." });
    }

    const target = getMentionedJid(msg) || getQuotedParticipant(msg);
    if (!target) {
      return sock.sendMessage(jid, {
        text: "Reply to the person's message or @mention them, e.g. !kick @user",
      });
    }

    await sock.groupParticipantsUpdate(jid, [target], "remove");
    await sock.sendMessage(jid, { text: "Done." });
  },
};
