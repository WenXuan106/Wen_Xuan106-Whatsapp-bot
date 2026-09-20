const { getMentionedJid, getQuotedParticipant } = require("../lib/admin");

module.exports = {
  name: "pfp",
  description: "Get someone's profile picture — reply to their message, @mention them, or use alone for your own.",
  async execute({ sock, jid, msg }) {
    const targetJid =
      getMentionedJid(msg) || getQuotedParticipant(msg) || msg.key.participant || msg.key.remoteJid;

    try {
      const url = await sock.profilePictureUrl(targetJid, "image");
      await sock.sendMessage(jid, { image: { url }, caption: "📸 Profile picture" }, { quoted: msg });
    } catch (err) {
      console.error("pfp command failed:", err.message);
      await sock.sendMessage(
        jid,
        { text: "❌ Couldn't fetch that profile picture (they may not have one set, or it's private)." },
        { quoted: msg }
      );
    }
  },
};
