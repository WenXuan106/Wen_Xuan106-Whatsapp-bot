const axios = require("axios");

const LANGUAGE_CODES = {
  afrikaans: "af", albanian: "sq", amharic: "am", arabic: "ar", armenian: "hy",
  azerbaijani: "az", basque: "eu", belarusian: "be", bengali: "bn", bosnian: "bs",
  bulgarian: "bg", catalan: "ca", cebuano: "ceb", chichewa: "ny", chinese: "zh-CN",
  corsican: "co", croatian: "hr", czech: "cs", danish: "da", dutch: "nl",
  english: "en", esperanto: "eo", estonian: "et", filipino: "tl", finnish: "fi",
  french: "fr", frisian: "fy", galician: "gl", georgian: "ka", german: "de",
  greek: "el", gujarati: "gu", haitian: "ht", hausa: "ha", hawaiian: "haw",
  hebrew: "he", hindi: "hi", hmong: "hmn", hungarian: "hu", icelandic: "is",
  igbo: "ig", indonesian: "id", irish: "ga", italian: "it", japanese: "ja",
  javanese: "jw", kannada: "kn", kazakh: "kk", khmer: "km", korean: "ko",
  kurdish: "ku", kyrgyz: "ky", lao: "lo", latin: "la", latvian: "lv",
  lithuanian: "lt", luxembourgish: "lb", macedonian: "mk", malagasy: "mg",
  malay: "ms", malayalam: "ml", maltese: "mt", maori: "mi", marathi: "mr",
  mongolian: "mn", myanmar: "my", nepali: "ne", norwegian: "no", pashto: "ps",
  persian: "fa", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro",
  russian: "ru", samoan: "sm", scots: "gd", serbian: "sr", sesotho: "st",
  shona: "sn", sindhi: "sd", sinhala: "si", slovak: "sk", slovenian: "sl",
  somali: "so", spanish: "es", sundanese: "su", swahili: "sw", swedish: "sv",
  tajik: "tg", tamil: "ta", telugu: "te", thai: "th", turkish: "tr",
  ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi", welsh: "cy",
  xhosa: "xh", yiddish: "yi", yoruba: "yo", zulu: "zu",
};

function resolveLanguageCode(name) {
  return LANGUAGE_CODES[name.toLowerCase().trim()] || null;
}

module.exports = {
  name: "translate",
  description:
    "Translate text by language name, e.g. !translate spanish Hello there — or reply to a message with !translate <language>.",
  async execute(ctx) {
    if (!ctx.args.length) {
      return ctx.sendText(
        "Usage: !translate <language> <text>\nOr reply to a message with: !translate <language>\nExample: !translate Spanish Hello there"
      );
    }

    const languageName = ctx.args[0];
    const targetLang = resolveLanguageCode(languageName);
    if (!targetLang) {
      return ctx.sendText(
        `❌ Unknown language "${languageName}". Try a common language name, e.g. Spanish, French, Japanese, Korean, Chinese.`
      );
    }

    // If this is a reply to another message and no extra text was typed,
    // translate the replied-to message instead of requiring it retyped.
    const text = ctx.quotedText || ctx.args.slice(1).join(" ").trim();
    if (!text) {
      return ctx.sendText("Usage: !translate <language> <text>\nOr reply to a message with: !translate <language>");
    }

    try {
      const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
        params: { client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text },
        timeout: 15000,
      });
      const translated = res.data?.[0]?.map((chunk) => chunk[0]).join("") || "";
      if (!translated) {
        return ctx.sendText("❌ Couldn't translate that.");
      }
      await ctx.sendText(`🌐 *Translation (${languageName})*\n${translated}`);
    } catch (err) {
      console.error("translate command failed:", err.message);
      await ctx.sendText("❌ Something went wrong with translation.");
    }
  },
};
