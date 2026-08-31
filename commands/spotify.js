const axios = require("axios");
const config = require("../config");

// Spotify's official Web API, client-credentials flow — free, but needs a
// client ID/secret from a free app registered at developer.spotify.com.
// This flow only allows read-only catalog access (search, metadata) — it
// cannot play or download audio, which is exactly the point here: info +
// a real link, not a copy of the track.
let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    }
  );

  cachedToken = {
    value: res.data.access_token,
    // Refresh a little early (60s buffer) so we never send an about-to-expire token.
    expiresAt: Date.now() + (res.data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

module.exports = {
  name: "spotify",
  description: "Search Spotify for a song and get its info + link, e.g. !spotify con calma",
  async execute({ sock, jid, msg, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return sock.sendMessage(jid, { text: "Usage: !spotify <song/artist>" }, { quoted: msg });
    }

    if (!config.SPOTIFY_CLIENT_ID || !config.SPOTIFY_CLIENT_SECRET) {
      return sock.sendMessage(
        jid,
        {
          text: "❌ Spotify isn't configured — ask the bot owner to set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
        },
        { quoted: msg }
      );
    }

    try {
      const token = await getAccessToken();
      const res = await axios.get("https://api.spotify.com/v1/search", {
        params: { q: query, type: "track", limit: 1 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      const track = res.data?.tracks?.items?.[0];
      if (!track) {
        return sock.sendMessage(jid, { text: `❌ No results found for "${query}".` }, { quoted: msg });
      }

      const artists = track.artists.map((a) => a.name).join(", ");
      const cover = track.album?.images?.[0]?.url;
      const caption = [
        `🎵 *${track.name}*`,
        "",
        `👤 Artist: ${artists}`,
        `💿 Album: ${track.album?.name || "Unknown"}`,
        `⏱️ Duration: ${formatDuration(track.duration_ms)}`,
        "",
        `▶️ ${track.external_urls?.spotify || ""}`,
      ].join("\n");

      if (cover) {
        await sock.sendMessage(jid, { image: { url: cover }, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: caption }, { quoted: msg });
      }
    } catch (err) {
      console.error("spotify command failed:", err.response?.status || err.message);
      await sock.sendMessage(jid, { text: "❌ Something went wrong with that search." }, { quoted: msg });
    }
  },
};
