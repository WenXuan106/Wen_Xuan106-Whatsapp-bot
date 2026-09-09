const axios = require("axios");

module.exports = {
  name: "translate",
  description: "Translate text, e.g. !translate es Hello, how are you?",
  async execute(ctx) {
    if (ctx.args.length < 2) {
      return ctx.sendText("Usage: !translate <language code> <text>\nExample: !translate es Hello there");
    }
    const targetLang = ctx.args[0];
    const text = ctx.args.slice(1).join(" ");

    try {
      const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
        params: { client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text },
        timeout: 15000,
      });
      const translated = res.data?.[0]?.map((chunk) => chunk[0]).join("") || "";
      if (!translated) {
        return ctx.sendText("❌ Couldn't translate that.");
      }
      await ctx.sendText(`🌐 *Translation (${targetLang})*\n${translated}`);
    } catch (err) {
      console.error("translate command failed:", err.message);
      await ctx.sendText("❌ Something went wrong with translation. Double-check the language code (e.g. es, fr, ja).");
    }
  },
};
