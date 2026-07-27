const QUESTIONS = [
  { q: "What is the capital of Japan?", a: "tokyo" },
  { q: "How many continents are there?", a: "7" },
  { q: "What planet is known as the Red Planet?", a: "mars" },
  { q: "What's the largest ocean on Earth?", a: "pacific" },
  { q: "In what year did WWII end?", a: "1945" },
  { q: "What language has the most native speakers?", a: "mandarin" },
];

// Tracks the current question per chat, so !answer knows what to check against.
const active = new Map();

module.exports = {
  name: "trivia",
  description: "Start a trivia question, then answer with !answer <your answer>",
  async execute({ sock, jid, msg }) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    active.set(jid, question.a.toLowerCase());
    await sock.sendMessage(jid, { text: `🧠 ${question.q}\n\nReply with !answer <your answer>` }, { quoted: msg });
  },
  _active: active,
};
