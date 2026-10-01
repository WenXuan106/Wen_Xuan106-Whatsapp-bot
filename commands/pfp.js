const axios = require("axios");

module.exports = {
  name: "pfp",
  description: "Get someone's profile picture — reply to their message, @mention them, or use alone for your own.",
  async execute(ctx) {
    const targetId = String(ctx.getTargetUser() || ctx.senderId);

    try {
      const url = await ctx.getProfilePictureUrl(targetId);
      if (!url) {
        return ctx.sendText("❌ Couldn't fetch that profile picture (they may not have one set, or it's private).");
      }

      // Download the picture and send the raw bytes instead of the link. On
      // Telegram the link contains the bot token, so it must never be sent
      // to a chat or handed to anyone else.
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024,
      });
      await ctx.sendImage(Buffer.from(res.data), "📸 Profile picture");
    } catch (err) {
      console.error("pfp command failed:", err.message);
      await ctx.sendText("❌ Couldn't fetch that profile picture (they may not have one set, or it's private).");
    }
  },
};
