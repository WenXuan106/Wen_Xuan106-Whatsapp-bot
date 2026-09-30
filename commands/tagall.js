// Telegram caps a message at 4096 characters and rate-limits mentions, so
// there the tags are split across several messages. WhatsApp keeps sending
// one message with everyone in it, as before.
const TELEGRAM_BATCH_SIZE = 30;

module.exports = {
  name: "tagall",
  description: "Mention every member of the group, e.g. !tagall meeting starting now. Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }

    const note = ctx.args.join(" ").trim();
    const mentions = await ctx.listMembers();
    const header = note ? `📢 ${note}` : "📢 Attention everyone!";

    if (ctx.platform !== "telegram") {
      const lines = [header, ""];
      lines.push(...mentions.map((id) => `@${ctx.shortId(id)}`));
      return ctx.sendMention(lines.join("\n"), mentions);
    }

    if (mentions.length === 0) {
      return ctx.sendText(header);
    }

    for (let i = 0; i < mentions.length; i += TELEGRAM_BATCH_SIZE) {
      const batch = mentions.slice(i, i + TELEGRAM_BATCH_SIZE);
      const lines = [i === 0 ? header : "📢 …", ""];
      lines.push(...batch.map((id) => `@${ctx.shortId(id)}`));
      await ctx.sendMention(lines.join("\n"), batch);
    }
  },
};
