module.exports = {
  name: "dice",
  description: "Roll a six-sided die",
  async execute(ctx) {
    const roll = Math.floor(Math.random() * 6) + 1;
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    await ctx.sendText(`${faces[roll - 1]} You rolled a ${roll}`);
  },
};
