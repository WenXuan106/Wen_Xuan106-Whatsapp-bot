module.exports = {
  name: "coinflip",
  description: "Flip a coin",
  async execute(ctx) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    await ctx.sendText(`🪙 ${result}!`);
  },
};
