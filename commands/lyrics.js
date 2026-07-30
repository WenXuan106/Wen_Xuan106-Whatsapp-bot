const axios = require("axios");

const MAX_CHARS = 4096;

module.exports = {
  name: "lyrics",
  description: "Look up song lyrics, e.g. !lyrics shape of you",
  async execute({ sock, jid, msg, args }) {
    const songTitle = args.join(" ").trim();
    if (!songTitle) {
      return sock.sendMessage(
        jid,
        { text: "🔍 Please enter a song name. Usage: !lyrics <song name>" },
        { quoted: msg }
      );
    }

    try {
      // LRCLIB is a free, key-free, actively maintained lyrics API. (The
      // reference repo used lyricsapi.fly.dev, a free-tier Fly.io hobby
      // app — those sleep when idle and time out unpredictably, which is
      // almost certainly what "error occurred while fetching the lyrics"
      // was — so this swaps to a more reliable source.)
      const { data } = await axios.get("https://lrclib.net/api/search", {
        params: { q: songTitle },
        timeout: 15000,
        headers: { "User-Agent": "Wen_Xuan106-Whatsapp-bot (https://github.com/)" },
      });

      const results = Array.isArray(data) ? data : [];
      const match = results.find((r) => r.plainLyrics) || results[0];
      const lyrics = match?.plainLyrics;

      if (!lyrics) {
        return sock.sendMessage(
          jid,
          { text: `❌ Sorry, I couldn't find any lyrics for "${songTitle}".` },
          { quoted: msg }
        );
      }

      const header = `🎵 *${match.trackName}*${match.artistName ? ` — ${match.artistName}` : ""}\n\n`;
      const budget = MAX_CHARS - header.length;
      const body = lyrics.length > budget ? `${lyrics.slice(0, budget - 3)}...` : lyrics;
      await sock.sendMessage(jid, { text: header + body }, { quoted: msg });
    } catch (error) {
      const detail = error.response
        ? `HTTP ${error.response.status}`
        : error.code || error.message;
      console.error(`Error in lyrics command (${detail}):`, error.message);
      await sock.sendMessage(
        jid,
        { text: `❌ Couldn't fetch lyrics for "${songTitle}" right now (${detail}). Try again in a bit.` },
        { quoted: msg }
      );
    }
  },
};
