const { startGame, stopGame } = require("../lib/scramble");

module.exports = {
  name: "scramble",
  description: "Word scramble game — !scramble to start, type the unscrambled word to win. !scramble stop to end.",
  async execute({ sock, jid, msg, args }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    if ((args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(jid);
      return sock.sendMessage(jid, {
        text: stopped ? "🛑 Scramble round stopped." : "No round is currently running.",
      });
    }

    const sendHint = (targetJid, text) => sock.sendMessage(targetJid, { text });
    const result = startGame(jid, sendHint);
    if (result.error) {
      return sock.sendMessage(jid, { text: result.error });
    }

    await sock.sendMessage(
      jid,
      {
        text: `🔤 *Word Scramble*\nUnscramble this: *${result.scrambled}*\n\nType your answer. A hint drops in 20s. *!scramble stop* to end.`,
      },
      { quoted: msg }
    );
  },
};
