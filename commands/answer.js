const { getActive, clearActive } = require("../lib/quiz");

module.exports = {
  name: "answer",
  description: "Answer the current quiz question (trivia/geography/science), e.g. !answer tokyo",
  async execute({ sock, jid, msg, args }) {
    const guess = args.join(" ").trim().toLowerCase();
    const question = getActive(jid);

    if (!question) {
      return sock.sendMessage(jid, {
        text: "No question active — start one with !trivia, !geography, or !science",
      });
    }
    if (!guess) {
      return sock.sendMessage(jid, { text: "Usage: !answer <your answer>" });
    }

    if (question.answers.includes(guess)) {
      clearActive(jid);
      await sock.sendMessage(jid, { text: "✅ Correct!" }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: "❌ Not quite, try again." }, { quoted: msg });
    }
  },
};
