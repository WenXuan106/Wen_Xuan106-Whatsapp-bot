const { getGame, startGame, stopGame, renderStatus } = require("../lib/hangman");

module.exports = {
  name: "hangman",
  description: "Play hangman, e.g. !hangman to start, then type single letters to guess. !hangman stop to end.",
  async execute({ sock, jid, msg, args }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    if ((args[0] || "").toLowerCase() === "stop") {
      const stopped = stopGame(jid);
      return sock.sendMessage(jid, {
        text: stopped ? "🛑 Hangman game stopped." : "No game is currently running.",
      });
    }

    const result = startGame(jid);
    if (result.error) {
      return sock.sendMessage(jid, { text: result.error });
    }

    await sock.sendMessage(
      jid,
      {
        text: `${renderStatus(result.game)}\n\nType a single letter to guess. *!hangman stop* to end.`,
      },
      { quoted: msg }
    );
  },
};
