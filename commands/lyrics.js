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
      const { data } = await axios.get("https://lyricsapi.fly.dev/api/lyrics", {
        params: { q: songTitle },
        timeout: 15000,
      });

      const lyrics = data?.result?.lyrics;
      if (!lyrics) {
        return sock.sendMessage(
          jid,
          { text: `❌ Sorry, I couldn't find any lyrics for "${songTitle}".` },
          { quoted: msg }
        );
      }

      const output = lyrics.length > MAX_CHARS ? `${lyrics.slice(0, MAX_CHARS - 3)}...` : lyrics;
      await sock.sendMessage(jid, { text: output }, { quoted: msg });
    } catch (error) {
      console.error("Error in lyrics command:", error.message);
      await sock.sendMessage(
        jid,
        { text: `❌ An error occurred while fetching the lyrics for "${songTitle}".` },
        { quoted: msg }
      );
    }
  },
};
