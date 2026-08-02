const axios = require("axios");
const config = require("../config");

/**
 * Casual/natural-sounding translation via OpenAI (the same official API
 * !gpt uses, with your own OPENAI_API_KEY — not a free community proxy).
 * Literal translation APIs tend to read stiff and overly formal; prompting
 * an LLM for a casual, conversational translation gives more natural
 * phrasing. Returns null if OPENAI_API_KEY isn't configured.
 */
async function translateCasual(text, languageName) {
  if (!config.OPENAI_API_KEY) return null;

  const prompt =
    `Translate the following text into casual, everyday ${languageName}, ` +
    `the way a native speaker would text a friend — natural and conversational, ` +
    `not stiff or overly formal. Reply with ONLY the translation, no explanation, ` +
    `no quotes, no extra text.\n\nText: ${text}`;

  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: config.OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const translated = data?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("empty response from OpenAI");
  return translated;
}

/**
 * DeepL — noticeably higher translation quality than Google Translate's
 * free endpoint. Requires a free DeepL API key (500k chars/month, no card
 * needed) set as DEEPL_API_KEY. Returns null if not configured or if this
 * language isn't in DeepL's supported set (language.deepl is undefined).
 */
async function translateDeepL(text, language) {
  if (!config.DEEPL_API_KEY || !language.deepl) return null;

  const { data } = await axios.post(
    "https://api-free.deepl.com/v2/translate",
    { text: [text], target_lang: language.deepl },
    {
      headers: {
        Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  const translated = data?.translations?.[0]?.text;
  if (!translated) throw new Error("no translation in response");
  return translated;
}

// Last-resort literal fallbacks, used only if OpenAI and DeepL are both
// unavailable/unconfigured or fail.
const LAST_RESORT_PROVIDERS = [
  async (text, code) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${code}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translated = data?.[0]?.[0]?.[0];
    if (!translated) throw new Error("no translation in response");
    return translated;
  },
  async (text, code) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${code}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) throw new Error("no translation in response");
    return translated;
  },
];

// Full language name (lowercase) -> { name: proper case for the AI prompt,
// code: ISO code for the Google/MyMemory fallback, deepl: DeepL's own
// target-language code (omitted where DeepL doesn't support the language,
// so that provider is skipped for it). Multi-word names (e.g. "chinese
// simplified") are matched by trying the longest phrase first so they
// aren't broken up by the single-word entries.
const LANGUAGES = {
  "chinese simplified": { name: "Simplified Chinese", code: "zh-CN", deepl: "ZH" },
  "chinese traditional": { name: "Traditional Chinese", code: "zh-TW" },
  "brazilian portuguese": { name: "Brazilian Portuguese", code: "pt", deepl: "PT-BR" },
  english: { name: "English", code: "en", deepl: "EN-US" },
  french: { name: "French", code: "fr", deepl: "FR" },
  spanish: { name: "Spanish", code: "es", deepl: "ES" },
  german: { name: "German", code: "de", deepl: "DE" },
  italian: { name: "Italian", code: "it", deepl: "IT" },
  portuguese: { name: "Portuguese", code: "pt", deepl: "PT-PT" },
  russian: { name: "Russian", code: "ru", deepl: "RU" },
  japanese: { name: "Japanese", code: "ja", deepl: "JA" },
  korean: { name: "Korean", code: "ko", deepl: "KO" },
  chinese: { name: "Chinese", code: "zh-CN", deepl: "ZH" },
  mandarin: { name: "Mandarin Chinese", code: "zh-CN", deepl: "ZH" },
  arabic: { name: "Arabic", code: "ar", deepl: "AR" },
  hindi: { name: "Hindi", code: "hi" },
  dutch: { name: "Dutch", code: "nl", deepl: "NL" },
  greek: { name: "Greek", code: "el", deepl: "EL" },
  turkish: { name: "Turkish", code: "tr", deepl: "TR" },
  vietnamese: { name: "Vietnamese", code: "vi" },
  thai: { name: "Thai", code: "th" },
  polish: { name: "Polish", code: "pl", deepl: "PL" },
  swedish: { name: "Swedish", code: "sv", deepl: "SV" },
  norwegian: { name: "Norwegian", code: "no", deepl: "NB" },
  danish: { name: "Danish", code: "da", deepl: "DA" },
  finnish: { name: "Finnish", code: "fi", deepl: "FI" },
  indonesian: { name: "Indonesian", code: "id", deepl: "ID" },
  malay: { name: "Malay", code: "ms" },
  filipino: { name: "Filipino", code: "tl" },
  tagalog: { name: "Tagalog", code: "tl" },
  hebrew: { name: "Hebrew", code: "he" },
  ukrainian: { name: "Ukrainian", code: "uk", deepl: "UK" },
  czech: { name: "Czech", code: "cs", deepl: "CS" },
  romanian: { name: "Romanian", code: "ro", deepl: "RO" },
  hungarian: { name: "Hungarian", code: "hu", deepl: "HU" },
  bengali: { name: "Bengali", code: "bn" },
  tamil: { name: "Tamil", code: "ta" },
  telugu: { name: "Telugu", code: "te" },
  urdu: { name: "Urdu", code: "ur" },
  persian: { name: "Persian", code: "fa" },
  farsi: { name: "Farsi", code: "fa" },
  swahili: { name: "Swahili", code: "sw" },
};

const USAGE =
  "*TRANSLATOR*\n\n" +
  "Usage:\n" +
  "1. Reply to a message with: !translate <language>\n" +
  "2. Or type: !translate <language> <text>\n\n" +
  "Example:\n!translate french hello\n\n" +
  "Supported languages include: English, French, Spanish, German, Italian, " +
  "Portuguese, Russian, Japanese, Korean, Chinese, Arabic, Hindi, Dutch, " +
  "Turkish, Vietnamese, Thai, and more.";

/** Pulls plain text out of a quoted message, if any (conversation, extended text, or media caption). */
function getQuotedText(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;
  return (
    quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    quoted.imageMessage?.caption ||
    quoted.videoMessage?.caption ||
    null
  );
}

/**
 * Matches a language name off the front of `args`, trying the longest
 * phrase first (up to 3 words) so multi-word names like "chinese simplified"
 * aren't misread as "chinese". Returns { language, rest } or null if no
 * recognized language name starts the args.
 */
function matchLanguage(args) {
  for (let wordCount = 3; wordCount >= 1; wordCount--) {
    if (args.length < wordCount) continue;
    const phrase = args.slice(0, wordCount).join(" ").toLowerCase();
    const language = LANGUAGES[phrase];
    if (language) {
      return { language, rest: args.slice(wordCount) };
    }
  }
  return null;
}

module.exports = {
  name: "translate",
  description: "Casually translate text: !translate <language> <text>, or reply to a message with !translate <language>",
  async execute({ sock, jid, msg, args }) {
    const quotedText = getQuotedText(msg);
    const match = matchLanguage(args);

    if (!match) {
      return sock.sendMessage(
        jid,
        {
          text: args.length
            ? `❌ "${args[0]}" isn't a language I recognize.\n\n${USAGE}`
            : USAGE,
        },
        { quoted: msg }
      );
    }

    const { language, rest } = match;
    const text = quotedText || rest.join(" ").trim();

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: "❌ No text found to translate. Please provide text or reply to a message." },
        { quoted: msg }
      );
    }

    // 1. OpenAI — casual, natural phrasing (if OPENAI_API_KEY is set).
    try {
      const translated = await translateCasual(text, language.name);
      if (translated) {
        return sock.sendMessage(jid, { text: translated }, { quoted: msg });
      }
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data?.error?.message || err.response.data)}`
        : err.message;
      console.error("casual translate (OpenAI) failed:", detail);
    }

    // 2. DeepL — much better literal-translation quality than Google (if DEEPL_API_KEY is set and this language is supported).
    try {
      const translated = await translateDeepL(text, language);
      if (translated) {
        return sock.sendMessage(jid, { text: translated }, { quoted: msg });
      }
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data?.message || err.response.data)}`
        : err.message;
      console.error("translate (DeepL) failed:", detail);
    }

    // 3. Last resort — Google Translate's free endpoint, then MyMemory.
    for (const translate of LAST_RESORT_PROVIDERS) {
      try {
        const translated = await translate(text, language.code);
        return sock.sendMessage(jid, { text: translated }, { quoted: msg });
      } catch (err) {
        console.error("last-resort translate provider failed:", err.message);
        continue;
      }
    }

    await sock.sendMessage(
      jid,
      { text: "❌ Failed to translate text. Please try again later." },
      { quoted: msg }
    );
  },
};
