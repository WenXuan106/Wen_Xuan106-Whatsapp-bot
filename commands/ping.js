module.exports = {
  name: "ping",
  description: "Check that the bot is alive and see response time",
  async execute({ sock, msg, jid }) {
    const start = Date.now();
    await sock.sendMessage(jid, { text: "🏓 Pong!" }, { quoted: msg });
    const ms = Date.now() - start;
    await sock.sendMessage(jid, { text: `Response time: ${ms}ms` });
  },
};
