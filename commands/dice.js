module.exports = {
  name: "dice",
  description: "Roll a six-sided die",
  async execute({ sock, jid, msg }) {
    const roll = Math.floor(Math.random() * 6) + 1;
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    await sock.sendMessage(jid, { text: `${faces[roll - 1]} You rolled a ${roll}` }, { quoted: msg });
  },
};
