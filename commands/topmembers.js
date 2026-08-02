const { getTop } = require("../lib/topmembers");

module.exports = {
  name: "topmembers",
  description: "Show the 5 most active members in this group by message count",
  async execute({ sock, msg, jid }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const top = getTop(jid, 5);
    if (top.length === 0) {
      return sock.sendMessage(jid, { text: "No message activity recorded yet." });
    }

    const lines = ["🏆 *Top Members*", ""];
    top.forEach(([userJid, count], i) => {
      lines.push(`${i + 1}. @${userJid.split("@")[0]} — ${count} message${count === 1 ? "" : "s"}`);
    });

    await sock.sendMessage(
      jid,
      { text: lines.join("\n"), mentions: top.map(([userJid]) => userJid) },
      { quoted: msg }
    );
  },
};
