// commands/
// Digits-only, country code included, no "+" or spaces — WhatsApp JID format.
const BIRTHDAY_JID = "6588597926@s.whatsapp.net";

module.exports = {
  name: "birthday",
  description: "Send a happy birthday shoutout",
  async execute({ sock, msg, jid }) {
    await sock.sendMessage(
      jid,
      {
        text: `🎉🎂 Happy Birthday @${BIRTHDAY_JID.split("@")[0]}! 🎂🎉`,
        mentions: [BIRTHDAY_JID],
      },
      { quoted: msg }
    );
  },
};
