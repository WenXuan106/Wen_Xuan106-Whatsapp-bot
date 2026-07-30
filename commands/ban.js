const { getGroupAdminStatus, getMentionedJid, getQuotedParticipant } = require("../lib/admin");
const { addBanned } = require("../lib/banlist");

module.exports = {
  name: "ban",
  description: "Stop a member from using bot commands (reply to them or @mention). Admins only.",
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
        text: "Reply to the person's message or @mention them, e.g. !ban @user",
      });
    }

    // The bot itself should never end up on its own ban list.
    if (target === sock.user?.id) {
      return sock.sendMessage(jid, { text: "I can't ban myself." });
    }

    const added = addBanned(target);
    await sock.sendMessage(
      jid,
      {
        text: added
          ? `🚫 @${target.split("@")[0]} has been banned from using my commands.`
          : `@${target.split("@")[0]} is already banned.`,
        mentions: [target],
      },
      { quoted: msg }
    );
  },
};
