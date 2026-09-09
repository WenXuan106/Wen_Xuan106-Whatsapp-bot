const axios = require("axios");

module.exports = {
  name: "meme",
  description: "Get a random meme",
  async execute(ctx) {
    try {
      const res = await axios.get("https://meme-api.com/gimme", { timeout: 15000 });
      const meme = res.data;
      if (!meme?.url) {
        return ctx.sendText("❌ Couldn't fetch a meme right now.");
      }
      const caption = `😂 *${meme.title}*\nr/${meme.subreddit} • 👍 ${meme.ups}`;
      await ctx.sendImage(meme.url, caption);
    } catch (err) {
      console.error("meme command failed:", err.message);
      await ctx.sendText("❌ Something went wrong fetching a meme.");
    }
  },
};
