const { getGroupAdminStatus, getMentionedJid, getQuotedParticipant } = require("../lib/admin");

module.exports = {
  name: "demote",
  description: "Remove a member's admin status (reply to them or @mention). Admins only.",
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

    const target = getMentionedJid(msg) || getQuotedParticipant(msg);
    if (!target) {
      return sock.sendMessage(jid, {
        text: "Reply to the person's message or @mention them, e.g. !demote @user",
      });
    }

    await sock.groupParticipantsUpdate(jid, [target], "demote");
    await sock.sendMessage(jid, { text: "Done." });
  },
};
