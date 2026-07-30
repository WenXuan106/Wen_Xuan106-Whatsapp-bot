const { isOwner } = require("../lib/admin");
const config = require("../config");

module.exports = {
  name: "stop",
  description: "Shut the bot down completely. Owner only.",
  async execute({ sock, msg, jid }) {
    if (!isOwner(msg, config)) {
      return sock.sendMessage(jid, { text: "Only the bot owner can use this command." }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: "🛑 Shutting down…" }, { quoted: msg });

    // Give the confirmation message a moment to actually reach WhatsApp's
    // servers before tearing down the socket and killing the process —
    // exiting immediately can beat the send over the wire.
    setTimeout(() => {
      try {
        sock.end(new Error("Stopped via !stop command"));
      } catch (_) {
        // socket may already be closing — fine to ignore
      }
      // Exit code 0 = clean/expected exit. Railway (and most host restart
      // policies) only auto-restart on a *failed* exit, so this actually
      // stops the bot instead of bouncing right back up. To bring it back
      // you'll need to manually redeploy/restart from Railway's dashboard.
      process.exit(0);
    }, 1500);
  },
};
