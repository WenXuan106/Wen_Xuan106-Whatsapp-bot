const { getActive, clearActive } = require("../lib/quiz");

module.exports = {
  name: "answer",
  description: "Answer the current quiz question (trivia/geography/science), e.g. !answer tokyo",
  async execute(ctx) {
    const guess = ctx.args.join(" ").trim().toLowerCase();
    const question = getActive(ctx.chatId);

    if (!question) {
      return ctx.sendText("No question active — start one with !trivia, !geography, or !science");
    }
    if (!guess) {
      return ctx.sendText("Usage: !answer <your answer>");
    }

    if (question.answers.includes(guess)) {
      clearActive(ctx.chatId);
      await ctx.sendText("✅ Correct!");
    } else {
      await ctx.sendText("❌ Not quite, try again.");
    }
  },
};
