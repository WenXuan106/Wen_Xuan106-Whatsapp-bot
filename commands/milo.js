module.exports = {
  name: "milo",
  description: "Check that the bot is alive and see response time",
  async execute(ctx) {
    const start = Date.now();
    await ctx.sendText("MILO!!!");
    const ms = Date.now() - start;
    await ctx.sendText(`Response time: ${ms}ms`);
  },
};
