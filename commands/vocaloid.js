const axios = require("axios");

// VocaDB is a free, community-run Vocaloid database with a public REST
// API — no key required. https://vocadb.net/api/
const VOCADB_BASE = "https://vocadb.net/api";

function truncate(text, max) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

async function searchSong(query) {
  const res = await axios.get(`${VOCADB_BASE}/songs`, {
    params: {
      query,
      maxResults: 1,
      nameMatchMode: "Auto",
      sort: "RatingScore",
      fields: "PVs,Artists",
      lang: "English",
    },
    timeout: 15000,
  });
  return res.data?.items?.[0] || null;
}

async function searchCharacter(query) {
  const res = await axios.get(`${VOCADB_BASE}/artists`, {
    params: {
      query,
      artistTypes: "Vocaloid",
      maxResults: 1,
      nameMatchMode: "Auto",
      fields: "MainPicture",
    },
    timeout: 15000,
  });
  return res.data?.items?.[0] || null;
}

function formatSong(song) {
  const pv = (song.pvs || []).find((p) => p.pvType === "Original") || song.pvs?.[0];
  const publishDate = song.publishDate ? new Date(song.publishDate).toLocaleDateString() : "Unknown";

  return {
    caption: [
      `🎵 *${song.defaultName || song.name}*`,
      "",
      `🎤 Artists: ${song.artistString || "Unknown"}`,
      `📀 Type: ${song.songType || "Unknown"}`,
      `📅 Published: ${publishDate}`,
      `⭐ Rating score: ${song.ratingScore ?? "N/A"}`,
      "",
      pv?.url ? `▶️ ${pv.url}` : "No video link available.",
    ].join("\n"),
    thumb: pv?.thumbUrl || song.mainPicture?.urlThumb,
  };
}

function formatCharacter(character) {
  return {
    caption: [
      `🎤 *${character.name}*`,
      "",
      `🏷️ Type: ${character.artistType || "Vocaloid"}`,
      character.additionalNames ? `Also known as: ${truncate(character.additionalNames, 200)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    thumb: character.mainPicture?.urlOriginal || character.mainPicture?.urlThumb,
  };
}

module.exports = {
  name: "vocaloid",
  description: "Search a Vocaloid song by name, or a character/voicebank with '!vocaloid character <name>'.",
  async execute({ sock, jid, msg, args }) {
    if (!args.length) {
      return sock.sendMessage(
        jid,
        {
          text: [
            "Usage:",
            "!vocaloid <song name> — search a Vocaloid song",
            "!vocaloid character <name> — search a Vocaloid character/voicebank",
          ].join("\n"),
        },
        { quoted: msg }
      );
    }

    const isCharacterSearch = args[0].toLowerCase() === "character";
    const query = (isCharacterSearch ? args.slice(1) : args).join(" ").trim();

    if (!query) {
      return sock.sendMessage(
        jid,
        { text: isCharacterSearch ? "Usage: !vocaloid character <name>" : "Usage: !vocaloid <song name>" },
        { quoted: msg }
      );
    }

    try {
      if (isCharacterSearch) {
        const character = await searchCharacter(query);
        if (!character) {
          return sock.sendMessage(jid, { text: `❌ No Vocaloid character found for "${query}".` }, { quoted: msg });
        }
        const { caption, thumb } = formatCharacter(character);
        if (thumb) {
          await sock.sendMessage(jid, { image: { url: thumb }, caption }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: caption }, { quoted: msg });
        }
      } else {
        const song = await searchSong(query);
        if (!song) {
          return sock.sendMessage(jid, { text: `❌ No Vocaloid song found for "${query}".` }, { quoted: msg });
        }
        const { caption, thumb } = formatSong(song);
        if (thumb) {
          await sock.sendMessage(jid, { image: { url: thumb }, caption }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { text: caption }, { quoted: msg });
        }
      }
    } catch (err) {
      console.error("vocaloid command failed:", err.message);
      await sock.sendMessage(jid, { text: "❌ Something went wrong with that search." }, { quoted: msg });
    }
  },
};
