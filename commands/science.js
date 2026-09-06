const { startQuestion } = require("../lib/quiz");

const QUESTIONS = [
  { q: "What planet is known as the Red Planet?", a: "mars" },
  { q: "What gas do plants absorb from the atmosphere for photosynthesis?", a: ["carbon dioxide", "co2"] },
  { q: "What is the chemical symbol for gold?", a: "au" },
  { q: "How many bones are in the adult human body?", a: "206" },
  { q: "What is the powerhouse of the cell?", a: "mitochondria" },
  { q: "What force pulls objects toward the Earth?", a: "gravity" },
  { q: "What is the boiling point of water in Celsius at sea level?", a: "100" },
  { q: "What is the closest planet to the Sun?", a: "mercury" },
  { q: "What is the chemical symbol for sodium?", a: "na" },
  { q: "What type of animal is a Komodo dragon?", a: ["lizard", "reptile"] },
  { q: "What is the hardest natural substance on Earth?", a: "diamond" },
  { q: "What gas makes up about 78% of Earth's atmosphere?", a: "nitrogen" },
  { q: "What organ pumps blood through the body?", a: "heart" },
  { q: "What is H2O commonly known as?", a: "water" },
  { q: "Who developed the theory of general relativity?", a: "einstein" },
];

module.exports = {
  name: "science",
  description: "Start a science question, then answer with !answer <your answer>",
  async execute(ctx) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    startQuestion(ctx.chatId, question.a, "science");
    await ctx.sendText(`🔬 ${question.q}\n\nReply with !answer <your answer>`);
  },
};
