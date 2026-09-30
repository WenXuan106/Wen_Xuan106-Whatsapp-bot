const { loadData, saveData, getGroupConfig, DEFAULT_BADWORDS } = require("../lib/civilguard");

module.exports = {
  name: "civilguard",
  description:
    "Bad-word filter for the group: on/off, add/remove words, or list status. Admins only.",
  async execute(ctx) {
    if (!ctx.isGroup) {
      return ctx.sendText("This command only works in groups.");
    }

    const { senderIsAdmin } = await ctx.getAdminStatus();
    if (!senderIsAdmin) {
      return ctx.sendText("Only group admins can use this command.");
    }

    const { args } = ctx;
    const data = loadData();
    const groupConfig = getGroupConfig(data, String(ctx.chatId));
    const sub = (args[0] || "").toLowerCase();

    switch (sub) {
      case "on": {
        groupConfig.enabled = true;
        saveData(data);
        return ctx.sendText("🛡️ Civilguard is now *ON* — messages with bad words will be deleted and the sender warned.");
      }

      case "off": {
        groupConfig.enabled = false;
        saveData(data);
        return ctx.sendText("🛡️ Civilguard is now *OFF*.");
      }

      case "add": {
        const word = args.slice(1).join(" ").trim().toLowerCase();
        if (!word) {
          return ctx.sendText("Usage: !civilguard add <word>");
        }
        if (!groupConfig.words.includes(word)) groupConfig.words.push(word);
        saveData(data);
        return ctx.sendText(`Added "${word}" to this group's word list.`);
      }

      case "remove": {
        const word = args.slice(1).join(" ").trim().toLowerCase();
        if (!word) {
          return ctx.sendText("Usage: !civilguard remove <word>");
        }
        groupConfig.words = groupConfig.words.filter((w) => w !== word);
        saveData(data);
        return ctx.sendText(`Removed "${word}" from this group's word list (if it was there).`);
      }

      case "list": {
        const custom = groupConfig.words.length ? groupConfig.words.join(", ") : "(none)";
        return ctx.sendText([
            `🛡️ Civilguard is *${groupConfig.enabled ? "ON" : "OFF"}*`,
            `Built-in words: ${DEFAULT_BADWORDS.length}`,
            `Custom words: ${custom}`,
          ].join("\n"));
      }

      default: {
        return ctx.sendText([
            "Usage:",
            "!civilguard on — enable the filter",
            "!civilguard off — disable the filter",
            "!civilguard add <word> — add a custom word",
            "!civilguard remove <word> — remove a custom word",
            "!civilguard list — show status and word list",
          ].join("\n"));
      }
    }
  },
};
