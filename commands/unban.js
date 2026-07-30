const { getGroupAdminStatus, getMentionedJid, getQuotedParticipant } = require("../lib/admin");
const { removeBanned } = require("../lib/banlist");

module.exports = {
  name: "unban",
  description: "Let a banned member use bot commands again (reply to them or @mention). Admins only.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }

    const target = getMentionedJid(msg) || getQuotedParticipant(msg);
    if (!target) {
      return sock.sendMessage(jid, {
        text: "Reply to the person's message or @mention them, e.g. !unban @user",
      });
    }

    const removed = removeBanned(target);
    await sock.sendMessage(
      jid,
      {
        text: removed
          ? `✅ @${target.split("@")[0]} has been unbanned.`
          : `@${target.split("@")[0]} isn't banned.`,
        mentions: [target],
      },
      { quoted: msg }
    );
  },
};
