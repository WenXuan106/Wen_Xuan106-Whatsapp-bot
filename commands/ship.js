module.exports = {
  name: "ship",
  description: "Ship two people, e.g. !ship Alice, Bob",
  async execute(ctx) {
    const raw = ctx.args.join(" ");
    const parts = raw
      .split(/,| and | & /i)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length < 2) {
      return ctx.sendText("Usage: !ship <name1>, <name2>");
    }

    const [name1, name2] = parts;
    const percent = Math.floor(Math.random() * 101);
    const shipName = (
      name1.slice(0, Math.ceil(name1.length / 2)) + name2.slice(Math.floor(name2.length / 2))
    ).trim();
    const filled = Math.round(percent / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);

    await ctx.sendText(`💘 *${name1}* + *${name2}* = *${shipName}*\n${bar} ${percent}%`);
  },
};
