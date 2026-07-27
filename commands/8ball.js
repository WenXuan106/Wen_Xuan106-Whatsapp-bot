const ANSWERS = [
  "Yes, definitely.",
  "It is certain.",
  "Without a doubt.",
  "Most likely.",
  "Ask again later.",
  "Cannot predict now.",
  "Don't count on it.",
  "My sources say no.",
  "Very doubtful.",
  "Outlook not so good.",
];

module.exports = {
  name: "8ball",
  description: "Ask the magic 8-ball a question, e.g. !8ball will it rain today",
  async execute({ sock, jid, msg, args }) {
    if (args.length === 0) {
      return sock.sendMessage(jid, { text: "Ask a question, e.g. !8ball will it rain today?" });
    }
    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    await sock.sendMessage(jid, { text: `🎱 ${answer}` }, { quoted: msg });
  },
};
