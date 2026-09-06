const yts = require("yt-search");

function formatDuration(seconds) {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = h > 0 ? [h, m, s] : [m, s];
  return parts.map((p, i) => (i === 0 ? String(p) : String(p).padStart(2, "0"))).join(":");
}

function formatViews(views) {
  if (!views) return "Unknown";
  if (views >= 1e9) return `${(views / 1e9).toFixed(1)}B`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(1)}M`;
  if (views >= 1e3) return `${(views / 1e3).toFixed(1)}K`;
  return String(views);
}

module.exports = {
  name: "song",
  description: "Search YouTube for a song and get its info + link, e.g. !song lemon tree",
  async execute(ctx) {
    const query = ctx.args.join(" ").trim();
    if (!query) {
      return ctx.sendText("Usage: !song <name>");
    }

    try {
      const { videos } = await yts(query);
      const video = videos?.[0];

      if (!video) {
        return ctx.sendText(`❌ No results found for "${query}".`);
      }

      const caption = [
        `🎵 *${video.title}*`,
        "",
        `📺 Channel: ${video.author?.name || "Unknown"}`,
        `⏱️ Duration: ${formatDuration(video.seconds)}`,
        `👁️ Views: ${formatViews(video.views)}`,
        `📅 Uploaded: ${video.ago || "Unknown"}`,
        "",
        `▶️ ${video.url}`,
      ].join("\n");

      await ctx.sendImage(video.thumbnail, caption);
    } catch (err) {
      console.error("song command failed:", err.message);
      await ctx.sendText("❌ Something went wrong with that search.");
    }
  },
};
