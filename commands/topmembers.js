const { getTop } = require("../lib/topmembers");

module.exports = {
  name: "topmembers",
  description: "Show the 5 most active members in this group by message count",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const top = getTop(String(ctx.chatId), 5);
    if (top.length === 0) {
      return ctx.sendText("No message activity recorded yet.");
    }

    const lines = ["🏆 *Top Members*", ""];
    top.forEach(([userId, count], i) => {
      lines.push(`${i + 1}. @${ctx.shortId(userId)} — ${count} message${count === 1 ? "" : "s"}`);
    });

    await ctx.sendMention(
      lines.join("\n"),
      top.map(([userId]) => userId)
    );
  },
};
