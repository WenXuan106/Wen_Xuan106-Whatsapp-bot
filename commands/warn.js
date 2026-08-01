const { getGroupAdminStatus, getMentionedJid, getQuotedParticipant, resolveParticipantId } = require("../lib/admin");
const { MAX_WARNINGS, addWarning, clearWarnings } = require("../lib/warnings");

module.exports = {
  name: "warn",
  description: "Warn a member (reply to them or @mention). Auto-kicks after 3 warnings. Admins only.",
  async execute({ sock, msg, jid, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin, botIsAdmin, participants } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }
    if (!botIsAdmin) {
      return sock.sendMessage(jid, { text: "I need to be a group admin to do that." });
    }

    const rawTarget = getMentionedJid(msg) || getQuotedParticipant(msg);
    if (!rawTarget) {
      return sock.sendMessage(jid, {
        text: "Reply to the person's message or @mention them, e.g. !warn @user",
      });
    }

    const sender = msg.key.participant || msg.key.remoteJid;
    const target = await resolveParticipantId(sock, participants, rawTarget);

    if (target === sock.user?.id) {
      return sock.sendMessage(jid, { text: "I can't warn myself." });
    }

    const count = addWarning(jid, target);

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *Warning issued*\n\n` +
          `👤 User: @${target.split("@")[0]}\n` +
          `📈 Warnings: ${count}/${MAX_WARNINGS}\n` +
          `👮 By: @${sender.split("@")[0]}`,
        mentions: [target, sender],
      },
      { quoted: msg }
    );

    if (count >= MAX_WARNINGS) {
      const result = await sock.groupParticipantsUpdate(jid, [target], "remove");
      const ok = result?.[0]?.status === "200";
      if (ok) clearWarnings(jid, target);

      await sock.sendMessage(jid, {
        text: ok
          ? `🚫 @${target.split("@")[0]} has been removed after reaching ${MAX_WARNINGS} warnings.`
          : `Reached ${MAX_WARNINGS} warnings, but WhatsApp rejected the removal request.`,
        mentions: [target],
      });
    }
  },
};
