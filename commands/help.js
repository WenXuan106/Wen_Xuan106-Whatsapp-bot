const config = require("../config");

module.exports = {
  name: "help",
  description: "List all available commands",
  async execute({ sock, jid, commands }) {
    const lines = [`*${config.BOT_NAME}*`, ""];
    for (const cmd of commands.values()) {
      lines.push(`${config.PREFIX}${cmd.name} — ${cmd.description}`);
    }
    await sock.sendMessage(jid, { text: lines.join("\n") });
  },
};
