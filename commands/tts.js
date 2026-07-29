const googleTTS = require("google-tts-api");
const { spawn } = require("child_process");

const MAX_CHARS = 2000; // hard cap so one command can't loop forever
const DEFAULT_LANG = "en";

// WhatsApp voice notes (ptt: true) must be Ogg/Opus, not raw mp3. Sending
// mp3 bytes with ptt:true can look fine in the chat list and even "play" on
// Android, but iOS WhatsApp rejects it outright with "this voice message
// isn't available" — because the container/codec don't match what a real
// voice note is. This transcodes with ffmpeg (already required on PATH for
// the attp/anime commands — see nixpacks.toml/Dockerfile) into a 16kHz mono
// Opus-in-Ogg stream, which is what WhatsApp actually expects for ptt notes.
function mp3ToOggOpus(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "32k",
      "-vn",
      "-f", "ogg",
      "pipe:1",
    ];

    const ff = spawn("ffmpeg", args);
    const chunks = [];
    const errors = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (e) => errors.push(e));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });

    ff.stdin.write(mp3Buffer);
    ff.stdin.end();
  });
}

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
      const mp3 = Buffer.concat(buffers);
      const audio = await mp3ToOggOpus(mp3);

      // ptt: true sends it as a playable voice note rather than a
      // downloadable audio file attachment. It must be Ogg/Opus (not the
      // raw mp3 Google returns) or WhatsApp — especially on iOS — will
      // show it as an unplayable/corrupt voice note.
      await sock.sendMessage(
        jid,
        { audio, mimetype: "audio/ogg; codecs=opus", ptt: true },
        { quoted: msg }
      );
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
