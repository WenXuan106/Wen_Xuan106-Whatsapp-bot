const axios = require("axios");
const { Resvg } = require("@resvg/resvg-js");
const config = require("../config");
const { getProfile } = require("../lib/scores");
const { buildProfileCardSvg } = require("../lib/profilecard");

// Downloads someone's profile picture (as raw bytes) so it can be drawn onto
// the card. Returns null if they have none, it's private, or it fails.
async function downloadAvatar(ctx, userId) {
  const url = await ctx.getProfilePictureUrl(userId);
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024,
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error("profile: couldn't download the profile picture:", err.message);
    return null;
  }
}

function renderPng(svg) {
  const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
  return resvg.render().asPng();
}

module.exports = {
  name: "profile",
  description: "Show your game profile card (level, points, wins) — or reply to / @mention someone to see theirs.",
  async execute(ctx) {
    const targetId = String(ctx.getTargetUser() || ctx.senderId);
    const isSelf = targetId === String(ctx.senderId);

    const profile = getProfile(targetId);
    const name = (isSelf ? ctx.senderName : profile.name) || ctx.shortId(targetId);

    const summary =
      `👤 *${name}*\n` +
      `⭐ Level ${profile.level} • ${profile.title}\n` +
      `🏅 ${profile.points} points • 🏆 ${profile.totalWins} wins` +
      (profile.rank ? ` • Rank #${profile.rank} of ${profile.totalPlayers}` : "");

    const cardData = {
      botName: config.BOT_NAME,
      name,
      platform: ctx.platform,
      level: profile.level,
      title: profile.title,
      points: profile.points,
      levelStart: profile.levelStart,
      levelEnd: profile.levelEnd,
      rank: profile.rank,
      totalPlayers: profile.totalPlayers,
      totalWins: profile.totalWins,
      winRate: profile.winRate,
      bestGame: profile.bestGame,
      firstSeen: profile.firstSeen,
      games: profile.games,
    };

    try {
      const avatar = await downloadAvatar(ctx, targetId);

      let png;
      try {
        png = renderPng(buildProfileCardSvg({ ...cardData, avatar }));
      } catch (err) {
        // A picture format the renderer can't read shouldn't cost the whole card.
        if (!avatar) throw err;
        console.error("profile: card render failed with the picture, retrying without it:", err.message);
        png = renderPng(buildProfileCardSvg({ ...cardData, avatar: null }));
      }

      await ctx.sendImage(png, summary);
    } catch (err) {
      console.error("profile: card image failed, sending text only:", err.message);
      await ctx.sendText(summary);
    }
  },
};
