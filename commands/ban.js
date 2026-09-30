const { addBanned } = require("../lib/banlist");

module.exports = {
  name: "ban",
  description: "Stop a member from using bot commands (reply to them or @mention). Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }

    const target = ctx.getTargetUser();
    if (!target) {
      return ctx.sendText("Reply to the person's message or @mention them, e.g. !ban @user");
    }

    // The bot itself should never end up on its own ban list.
    if (ctx.isBotId(target)) {
      return ctx.sendText("I can't ban myself.");
    }

    const tag = `@${ctx.shortId(target)}`;
    const added = addBanned(target);
    await ctx.sendMention(
      added ? `🚫 ${tag} has been banned from using my commands.` : `${tag} is already banned.`,
      [target]
    );
  },
};
