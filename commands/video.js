const yts = require("yt-search");

const MAX_RESULTS = 5;

function formatDuration(seconds) {
  if (!seconds) return "Live/Unknown";
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
  name: "video",
  description: "Search YouTube for videos and get the top results, e.g. !video funny cats",
  async execute(ctx) {
    const query = ctx.args.join(" ").trim();
    if (!query) {
      return ctx.sendText("Usage: !video <search>");
    }

    try {
      const { videos } = await yts(query);
      const results = (videos || []).slice(0, MAX_RESULTS);

      if (results.length === 0) {
        return ctx.sendText(`❌ No videos found for "${query}".`);
      }

      const lines = [`🎬 *YouTube results for "${query}"*`, ""];
      results.forEach((video, i) => {
        lines.push(`${i + 1}. *${video.title}*`);
        lines.push(
          `   📺 ${video.author?.name || "Unknown"} • ⏱️ ${formatDuration(video.seconds)} • 👁️ ${formatViews(video.views)}`
        );
        lines.push(`   ▶️ ${video.url}`);
        lines.push("");
      });

      await ctx.sendText(lines.join("\n").trim());
    } catch (err) {
      console.error("video command failed:", err.message);
      await ctx.sendText("❌ Something went wrong with that search.");
    }
  },
};
