const { startAttpMenu, MAX_TEXT_LENGTH } = require("../lib/attp");

module.exports = {
  name: "attp",
  description: "Make a text sticker — pick Normal, Rainbow or Pop-Up. e.g. !attp Hello",
  async execute(ctx) {
    const text = ctx.args.join(" ").trim();
    if (!text) {
      return ctx.sendText("Usage: !attp <text>\nThen reply 1, 2 or 3 to choose the style.");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return ctx.sendText(`❌ That's a bit long — keep it under ${MAX_TEXT_LENGTH} characters.`);
    }
    // Shows the 1/2/3 menu; the reply is picked up by the hook in lib/whatsapp.js / lib/telegram.js.
    await startAttpMenu({
      chatId: ctx.chatId,
      senderId: ctx.senderId,
      text,
      sendText: (t) => ctx.sendText(t),
    });
  },
};
