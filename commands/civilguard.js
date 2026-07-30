const { getGroupAdminStatus } = require("../lib/admin");
const { loadData, saveData, getGroupConfig, DEFAULT_BADWORDS } = require("../lib/civilguard");

module.exports = {
  name: "civilguard",
  description:
    "Bad-word filter for the group: on/off, add/remove words, or list status. Admins only.",
  async execute({ sock, msg, jid, args, getGroupMetadata }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const { senderIsAdmin } = await getGroupAdminStatus(sock, jid, msg, getGroupMetadata);
    if (!senderIsAdmin) {
      return sock.sendMessage(jid, { text: "Only group admins can use this command." });
    }

    const data = loadData();
    const groupConfig = getGroupConfig(data, jid);
    const sub = (args[0] || "").toLowerCase();

    switch (sub) {
      case "on": {
        groupConfig.enabled = true;
        saveData(data);
        return sock.sendMessage(jid, {
          text: "🛡️ Civilguard is now *ON* — messages with bad words will be deleted and the sender warned.",
        });
      }

      case "off": {
        groupConfig.enabled = false;
        saveData(data);
        return sock.sendMessage(jid, { text: "🛡️ Civilguard is now *OFF*." });
      }

      case "add": {
        const word = args.slice(1).join(" ").trim().toLowerCase();
        if (!word) {
          return sock.sendMessage(jid, { text: "Usage: !civilguard add <word>" });
        }
        if (!groupConfig.words.includes(word)) groupConfig.words.push(word);
        saveData(data);
        return sock.sendMessage(jid, { text: `Added "${word}" to this group's word list.` });
      }

      case "remove": {
        const word = args.slice(1).join(" ").trim().toLowerCase();
        if (!word) {
          return sock.sendMessage(jid, { text: "Usage: !civilguard remove <word>" });
        }
        groupConfig.words = groupConfig.words.filter((w) => w !== word);
        saveData(data);
        return sock.sendMessage(jid, {
          text: `Removed "${word}" from this group's word list (if it was there).`,
        });
      }

      case "list": {
        const custom = groupConfig.words.length ? groupConfig.words.join(", ") : "(none)";
        return sock.sendMessage(jid, {
          text: [
            `🛡️ Civilguard is *${groupConfig.enabled ? "ON" : "OFF"}*`,
            `Built-in words: ${DEFAULT_BADWORDS.length}`,
            `Custom words: ${custom}`,
          ].join("\n"),
        });
      }

      default: {
        return sock.sendMessage(jid, {
          text: [
            "Usage:",
            "!civilguard on — enable the filter",
            "!civilguard off — disable the filter",
            "!civilguard add <word> — add a custom word",
            "!civilguard remove <word> — remove a custom word",
            "!civilguard list — show status and word list",
          ].join("\n"),
        });
      }
    }
  },
};
