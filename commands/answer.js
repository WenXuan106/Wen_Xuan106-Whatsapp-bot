const trivia = require("./trivia");

module.exports = {
  name: "answer",
  description: "Answer the current trivia question, e.g. !answer tokyo",
  async execute({ sock, jid, msg, args }) {
    const guess = args.join(" ").trim().toLowerCase();
    const correctAnswer = trivia._active.get(jid);

    if (!correctAnswer) {
      return sock.sendMessage(jid, { text: "No trivia question active — start one with !trivia" });
    }
    if (!guess) {
      return sock.sendMessage(jid, { text: "Usage: !answer <your answer>" });
    }

    if (guess === correctAnswer) {
      trivia._active.delete(jid);
      await sock.sendMessage(jid, { text: "✅ Correct!" }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: "❌ Not quite, try again." }, { quoted: msg });
    }
  },
};
