module.exports = {
  name: "groupinfo",
  description: "Show information about the current group.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const info = await ctx.getGroupInfo();

    const lines = [
      `📌 *${info.name}*`,
      "",
      `🆔 ID: ${info.id}`,
      `👑 Owner: ${info.ownerId ? "@" + ctx.shortId(info.ownerId) : "Unknown"}`,
      `📅 Created: ${info.createdAt}`,
      `👥 Members: ${info.memberCount}`,
      `🛡️ Admins: ${info.adminCount}`,
      "",
      info.description ? `📝 Description:\n${info.description}` : "📝 No description set.",
    ];

    const mentions = info.ownerId ? [info.ownerId] : [];
    await ctx.sendMention(lines.join("\n"), mentions);
  },
};
