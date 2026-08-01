const { getMentionedJid, getQuotedParticipant } = require("../lib/admin");
const { MAX_WARNINGS, getWarnings } = require("../lib/warnings");

module.exports = {
  name: "warnings",
  description: "Check a member's warning count (reply to them or @mention).",
  async execute({ sock, msg, jid }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const target = getMentionedJid(msg) || getQuotedParticipant(msg);
    if (!target) {
      return sock.sendMessage(jid, {
        text: "Reply to the person's message or @mention them, e.g. !warnings @user",
      });
    }

    const count = getWarnings(jid, target);
    await sock.sendMessage(
      jid,
      {
        text: `👤 @${target.split("@")[0]} has ${count}/${MAX_WARNINGS} warning(s).`,
        mentions: [target],
      },
      { quoted: msg }
    );
  },
};
