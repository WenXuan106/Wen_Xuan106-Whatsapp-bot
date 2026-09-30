const config = require("../config");

module.exports = {
  name: "stop",
  description: "Shut the bot down completely. Owner only.",
  async execute(ctx) {
    if (!ctx.isOwner()) {
      // On Telegram the owner is set with the TELEGRAM_OWNER_ID env variable.
      if (ctx.platform === "telegram" && !config.TELEGRAM_OWNER_ID) {
        return ctx.sendText("Only the bot owner can use this command. (Set TELEGRAM_OWNER_ID to enable it on Telegram.)");
      }
      return ctx.sendText("Only the bot owner can use this command.");
    }

    await ctx.sendText("🛑 Shutting down…");

    // Give the confirmation message a moment to actually reach the platform's
    // servers before tearing down the connection and killing the process —
    // exiting immediately can beat the send over the wire.
    setTimeout(async () => {
      try {
        await ctx.shutdown();
      } catch (_) {
        // connection may already be closing — fine to ignore
      }
      // Exit code 0 = clean/expected exit. Railway (and most host restart
      // policies) only auto-restart on a *failed* exit, so this actually
      // stops the bot instead of bouncing right back up. To bring it back
      // you'll need to manually redeploy/restart from Railway's dashboard.
      // Note this stops the whole process, so WhatsApp and Telegram both go down.
      process.exit(0);
    }, 1500);
  },
};
