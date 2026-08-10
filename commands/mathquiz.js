const { startGame, stopGame } = require("../lib/mathquiz");

module.exports = {
  name: "math",
  description: "Quick math quiz — !math to start, type the answer to win. !math stop to end.",
  async execute({ sock, jid, msg, args }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    if ((args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(jid);
      return sock.sendMessage(jid, {
        text: stopped ? "🛑 Math quiz stopped." : "No round is currently running.",
      });
    }

    const onTimeout = (targetJid, text) => sock.sendMessage(targetJid, { text });
    const result = startGame(jid, onTimeout);
    if (result.error) {
      return sock.sendMessage(jid, { text: result.error });
    }

    await sock.sendMessage(
      jid,
      {
        text: `🧮 *Math Quiz*\n${result.question} = ?\n\nFirst correct answer wins. 30s. *!math stop* to end.`,
      },
      { quoted: msg }
    );
  },
};
