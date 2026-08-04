const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { addStickerExif } = require("../lib/sticker");
const config = require("../config");

// --- Reaction gifs/stickers (!anime hug, !anime pat, etc.) --------------

const ANIMU_BASE = "https://api.some-random-api.com/animu";
const REACTION_TYPES = ["nom", "poke", "cry", "kiss", "pat", "hug", "wink", "face-palm", "quote"];

function normalizeReactionType(input) {
  const lower = (input || "").toLowerCase();
  if (lower === "facepalm" || lower === "face_palm") return "face-palm";
  if (lower === "quote" || lower === "animu-quote" || lower === "animuquote") return "quote";
  return lower;
}

// Requires the ffmpeg binary on PATH — see nixpacks.toml for the Railway build config.
function convertToSticker(mediaBuffer, isAnimated) {
  return new Promise((resolve, reject) => {
    const tmp = os.tmpdir();
    const input = path.join(tmp, `animu_${Date.now()}.${isAnimated ? "gif" : "jpg"}`);
    const output = path.join(tmp, `animu_${Date.now()}.webp`);
    fs.writeFileSync(input, mediaBuffer);

    const scale = "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000";
    const cmd = isAnimated
      ? `ffmpeg -y -i "${input}" -vf "${scale},fps=15" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 60 -compression_level 6 "${output}"`
      : `ffmpeg -y -i "${input}" -vf "${scale}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${output}"`;

    exec(cmd, async (err) => {
      if (err) {
        try { fs.unlinkSync(input); } catch {}
        return reject(err);
      }
      try {
        const webpBuffer = fs.readFileSync(output);
        const stickerBuffer = await addStickerExif(webpBuffer, { packname: config.BOT_NAME });
        resolve(stickerBuffer);
      } catch (e) {
        reject(e);
      } finally {
        try { fs.unlinkSync(input); } catch {}
        try { fs.unlinkSync(output); } catch {}
      }
    });
  });
}

async function sendReaction(sock, jid, msg, type) {
  const res = await axios.get(`${ANIMU_BASE}/${type}`, { timeout: 15000 });
  const data = res.data || {};

  if (data.link) {
    const lower = data.link.toLowerCase();
    const isGif = lower.endsWith(".gif");
    const isImage = /\.(jpg|jpeg|png|webp)$/.test(lower);

    if (isGif || isImage) {
      try {
        const resp = await axios.get(data.link, {
          responseType: "arraybuffer",
          timeout: 15000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const stickerBuffer = await convertToSticker(Buffer.from(resp.data), isGif);
        await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
        return;
      } catch (err) {
        console.error("Sticker conversion failed, sending as image instead:", err.message);
      }
    }

    await sock.sendMessage(jid, { image: { url: data.link }, caption: `anime: ${type}` }, { quoted: msg });
    return;
  }

  if (data.quote) {
    await sock.sendMessage(jid, { text: data.quote }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { text: "❌ Failed to fetch that." }, { quoted: msg });
}

// --- Anime / character search --------------------------------------------
// Jikan is a free, unofficial MyAnimeList API — no key required.
// Rate limit: ~3 req/sec, 60/min. https://docs.api.jikan.moe/
const JIKAN_BASE = "https://api.jikan.moe/v4";

function truncate(text, max) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

async function searchAnime(query) {
  const res = await axios.get(`${JIKAN_BASE}/anime`, {
    params: { q: query, limit: 1, sfw: true },
    timeout: 15000,
  });
  return res.data?.data?.[0] || null;
}

async function searchCharacter(query) {
  const res = await axios.get(`${JIKAN_BASE}/characters`, {
    params: { q: query, limit: 1 },
    timeout: 15000,
  });
  return res.data?.data?.[0] || null;
}

// Looks up an actual GIF of the character by name via Giphy. Returns a
// Buffer of the gif's bytes, or null if no key is configured / nothing
// found / the request fails — callers should degrade gracefully.
async function fetchCharacterGif(name) {
  if (!config.GIPHY_API_KEY) return null;
  try {
    const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
      params: { api_key: config.GIPHY_API_KEY, q: `${name} anime`, limit: 1, rating: "pg-13" },
      timeout: 15000,
    });
    const gifUrl = res.data?.data?.[0]?.images?.original?.url;
    if (!gifUrl) return null;
    const resp = await axios.get(gifUrl, { responseType: "arraybuffer", timeout: 15000 });
    return Buffer.from(resp.data);
  } catch (err) {
    console.error("Giphy character gif lookup failed:", err.message);
    return null;
  }
}

function formatAnime(anime) {
  const title = anime.title_english || anime.title;
  const altTitle = anime.title_english && anime.title_english !== anime.title ? ` (${anime.title})` : "";
  const genres = (anime.genres || []).map((g) => g.name).join(", ") || "Unknown";

  return [
    `📺 *${title}*${altTitle}`,
    "",
    `⭐ Score: ${anime.score ?? "N/A"}`,
    `📅 Aired: ${anime.aired?.string || "Unknown"}`,
    `🎬 Episodes: ${anime.episodes ?? "Unknown"}`,
    `📊 Status: ${anime.status || "Unknown"}`,
    `🏷️ Genres: ${genres}`,
    "",
    truncate(anime.synopsis, 600) || "No synopsis available.",
  ].join("\n");
}

function formatCharacter(character) {
  const kanji = character.name_kanji ? ` (${character.name_kanji})` : "";
  return [
    `🎭 *${character.name}*${kanji}`,
    "",
    truncate(character.about, 700) || "No bio available.",
  ].join("\n");
}

async function handleAnimeSearch(sock, jid, msg, query) {
  const anime = await searchAnime(query);
  if (!anime) {
    return sock.sendMessage(jid, { text: `❌ No anime found for "${query}".` }, { quoted: msg });
  }
  const image = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
  const caption = formatAnime(anime);
  if (image) {
    await sock.sendMessage(jid, { image: { url: image }, caption }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }
}

async function handleCharacterSearch(sock, jid, msg, query) {
  const character = await searchCharacter(query);
  if (!character) {
    return sock.sendMessage(jid, { text: `❌ No character found for "${query}".` }, { quoted: msg });
  }
  const caption = formatCharacter(character);

  // Send the info card first (with the static portrait, if any)...
  const image = character.images?.jpg?.image_url;
  if (image) {
    await sock.sendMessage(jid, { image: { url: image }, caption }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }

  // ...then a gif of the character, if we could find one.
  const gifBuffer = await fetchCharacterGif(character.name);
  if (gifBuffer) {
    await sock.sendMessage(jid, { video: gifBuffer, gifPlayback: true }, { quoted: msg });
  } else if (!config.GIPHY_API_KEY) {
    await sock.sendMessage(jid, {
      text: "ℹ️ Set GIPHY_API_KEY in your bot's config/env to also get a gif of characters (free at developers.giphy.com).",
    });
  }
}

module.exports = {
  name: "anime",
  description:
    `Search an anime by name, search a character with '!anime character <name>' (includes a gif), ` +
    `or react with '!anime <type>' — types: ${REACTION_TYPES.join(", ")}.`,
  async execute({ sock, jid, msg, args }) {
    if (!args.length) {
      return sock.sendMessage(
        jid,
        {
          text: [
            "Usage:",
            "!anime <name> — search an anime",
            "!anime character <name> — search a character (+ gif)",
            `!anime <type> — reaction gif/sticker: ${REACTION_TYPES.join(", ")}`,
          ].join("\n"),
        },
        { quoted: msg }
      );
    }

    const first = args[0].toLowerCase();

    try {
      if (first === "character") {
        const query = args.slice(1).join(" ").trim();
        if (!query) {
          return sock.sendMessage(jid, { text: "Usage: !anime character <name>" }, { quoted: msg });
        }
        await handleCharacterSearch(sock, jid, msg, query);
        return;
      }

      const reactionType = normalizeReactionType(first);
      if (REACTION_TYPES.includes(reactionType)) {
        await sendReaction(sock, jid, msg, reactionType);
        return;
      }

      // Anything else is treated as an anime title to search.
      await handleAnimeSearch(sock, jid, msg, args.join(" ").trim());
    } catch (err) {
      console.error("anime command failed:", err.message);
      await sock.sendMessage(jid, { text: "❌ Something went wrong with that." }, { quoted: msg });
    }
  },
};
