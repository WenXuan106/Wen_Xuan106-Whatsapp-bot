module.exports = {
  name: "coinflip",
  description: "Flip a coin",
  async execute({ sock, jid, msg }) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    await sock.sendMessage(jid, { text: `🪙 ${result}!` }, { quoted: msg });
  },
};
