const { startQuestion } = require("../lib/quiz");

const QUESTIONS = [
  { q: "What is the capital of France?", a: "paris" },
  { q: "What is the largest country by area?", a: "russia" },
  { q: "What is the smallest country in the world?", a: ["vatican", "vatican city"] },
  { q: "Which desert is the largest hot desert in the world?", a: "sahara" },
  { q: "What is the longest river in the world?", a: ["nile", "nile river"] },
  { q: "Mount Everest is located in which mountain range?", a: "himalayas" },
  { q: "What is the capital of Australia?", a: "canberra" },
  { q: "Which ocean is the largest?", a: "pacific" },
  { q: "How many continents are there?", a: "7" },
  { q: "What is the capital of Canada?", a: "ottawa" },
  { q: "Which African country was formerly known as Abyssinia?", a: "ethiopia" },
  { q: "What is the driest continent, excluding Antarctica?", a: "australia" },
  { q: "Which country has the most natural lakes?", a: "canada" },
  { q: "What strait separates Europe and Africa?", a: ["gibraltar", "strait of gibraltar"] },
  { q: "What is the capital of Egypt?", a: "cairo" },
];

module.exports = {
  name: "geography",
  description: "Start a geography question, then answer with !answer <your answer>",
  async execute({ sock, jid, msg }) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    startQuestion(jid, question.a, "geography");
    await sock.sendMessage(jid, { text: `🌍 ${question.q}\n\nReply with !answer <your answer>` }, { quoted: msg });
  },
};
