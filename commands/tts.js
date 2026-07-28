const googleTTS = require("google-tts-api");

const MAX_CHARS = 2000; // hard cap so one command can't loop forever
const DEFAULT_LANG = "en";

module.exports = {
  name: "tts",
  description:
    "Convert text to speech with Google's voice, e.g. !tts hello there — or with a language code: !tts es hola",
  async execute({ sock, jid, msg, args }) {
    if (!args.length) {
      return sock.sendMessage(
        jid,
        { text: "Usage: !tts <text>\nOptional language code: !tts es hola, como estas?" },
        { quoted: msg }
      );
    }

    // Optional 2-letter language code as the first word, e.g. "!tts es hola"
    let lang = DEFAULT_LANG;
    let text = args.join(" ").trim();
    const maybeLang = args[0].toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(maybeLang) && args.length > 1) {
      lang = maybeLang;
      text = args.slice(1).join(" ").trim();
    }

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: "Give me some text to speak, e.g. !tts hello there" },
        { quoted: msg }
      );
    }
    if (text.length > MAX_CHARS) {
      return sock.sendMessage(
        jid,
        { text: `That's too long (${text.length} chars). Keep it under ${MAX_CHARS} characters.` },
        { quoted: msg }
      );
    }

    try {
      // Google's free TTS endpoint caps each request at ~200 characters,
      // so longer text gets split into multiple chunks and stitched back
      // together into one audio buffer.
      const urls = googleTTS.getAllAudioUrls(text, {
        lang,
        slow: false,
        host: "https://translate.google.com",
      });

      const buffers = [];
      for (const { url } of urls) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google TTS request failed: ${res.status}`);
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
      const audio = Buffer.concat(buffers);

      // NOTE: ptt:true (voice note bubble) requires Opus-encoded audio —
      // sending raw mp3 that way shows up in WhatsApp as a corrupt,
      // unplayable voice note. Sending it as a regular audio attachment
      // avoids needing an mp3->opus conversion step (ffmpeg) entirely.
      await sock.sendMessage(jid, { audio, mimetype: "audio/mpeg" }, { quoted: msg });
    } catch (err) {
      console.error("tts command failed:", err);
      await sock.sendMessage(
        jid,
        { text: "⚠️ Couldn't generate speech for that. Try a shorter message or check the language code." },
        { quoted: msg }
      );
    }
  },
};
