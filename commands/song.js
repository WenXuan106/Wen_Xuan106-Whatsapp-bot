const yts = require("yt-search");

module.exports = {
  name: "song",
  description: "Search for a song and get a link to play it, e.g. !song shape of you",
  async execute({ sock, jid, msg, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return sock.sendMessage(jid, { text: "Usage: !song <song name>" });
    }

    const { videos } = await yts(query);
    const top = videos?.[0];

    if (!top) {
      return sock.sendMessage(jid, { text: `Couldn't find anything for "${query}".` }, { quoted: msg });
    }

    const caption =
      `🎵 *${top.title}*\n` +
      `👤 ${top.author.name}\n` +
      `⏱️ ${top.timestamp}\n` +
      `🔗 ${top.url}`;

    // Sends the thumbnail + a link the person taps to play it in the
    // YouTube app — the bot never downloads or serves the audio itself.
    await sock.sendMessage(jid, { image: { url: top.thumbnail }, caption }, { quoted: msg });
  },
};
