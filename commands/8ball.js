const RESPONSES = [
  "Yes, definitely.",
  "It is certain.",
  "Without a doubt.",
  "Most likely.",
  "Ask again later.",
  "Cannot predict now.",
  "Don't count on it.",
  "My reply is no.",
  "Very doubtful.",
  "Outlook not so good.",
];

module.exports = {
  name: "8ball",
  description: "Ask the magic 8-ball a question, e.g. !8ball will it rain today?",
  async execute(ctx) {
    if (!ctx.args.length) {
      return ctx.sendText("Usage: !8ball <question>");
    }
    const answer = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
    await ctx.sendText(`🎱 ${answer}`);
  },
};
