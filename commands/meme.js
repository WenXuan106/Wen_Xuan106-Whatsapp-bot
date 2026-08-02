// Free, keyless meme APIs, tried in order in case one is down. Content is
// whatever's currently trending on the source subreddits — no uptime or
// content-moderation guarantee from these third parties.
const MEME_PROVIDERS = [
  async () => {
    const res = await fetch("https://meme-api.com/gimme");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.url) throw new Error("no url in response");
    return { imageUrl: data.url, caption: data.title };
  },
  async () => {
    const res = await fetch("https://www.reddit.com/r/memes/random.json", {
      headers: { "User-Agent": "whatsapp-bot" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post?.url) throw new Error("no post found");
    return { imageUrl: post.url, caption: post.title };
  },
];

module.exports = {
  name: "meme",
  description: "Get a random meme",
  async execute({ sock, jid, msg }) {
    for (const fetchMeme of MEME_PROVIDERS) {
      try {
        const { imageUrl, caption } = await fetchMeme();
        return sock.sendMessage(
          jid,
          { image: { url: imageUrl }, caption: caption || "Here's your meme! 🎭" },
          { quoted: msg }
        );
      } catch (err) {
        console.error("meme provider failed:", err.message);
        continue; // try the next provider
      }
    }

    await sock.sendMessage(
      jid,
      { text: "❌ Failed to fetch a meme. Please try again later." },
      { quoted: msg }
    );
  },
};
