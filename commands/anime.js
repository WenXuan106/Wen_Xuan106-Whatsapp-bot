const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { addStickerExif } = require("../lib/sticker");
const config = require("../config");

// --- Reaction gifs/stickers (!anime hug, !anime pat, etc.) --------------

// some-random-api.com's /animu endpoint is gone (confirmed via live 404s on
// both the api. subdomain and bare domain) — switched to waifu.pics, which
// is actively maintained and keyless. Its SFW category list doesn't include
// a facepalm or text-quote equivalent, so those two reaction types were
// dropped rather than left silently broken.
const ANIMU_BASE = "https://api.waifu.pics/sfw";
const REACTION_TYPES = ["nom", "poke", "cry", "kiss", "pat", "hug", "wink"];

function normalizeReactionType(input) {
  return (input || "").toLowerCase();
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
  const url = `${ANIMU_BASE}/${type}`;
  let res;
  try {
    res = await axios.get(url, { timeout: 15000 });
  } catch (err) {
    // Name the exact URL + status in the log, so if this endpoint moves
    // again, the next failure is diagnosable from the log alone.
    console.error(`animu reaction fetch failed for ${url}:`, err.response?.status || err.message);
    throw err;
  }
  const data = res.data || {};

  if (data.url) {
    const lower = data.url.toLowerCase();
    const isGif = lower.endsWith(".gif");
    const isImage = /\.(jpg|jpeg|png|webp)$/.test(lower);

    if (isGif || isImage) {
      try {
        const resp = await axios.get(data.url, {
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

    await sock.sendMessage(jid, { image: { url: data.url }, caption: `anime: ${type}` }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { text: "❌ Failed to fetch that." }, { quoted: msg });
}

// --- Anime / character search --------------------------------------------
// Primary: Jikan, a free unofficial MyAnimeList API — no key required.
// https://docs.api.jikan.moe/ — being a scraper of another site (not a
// first-party API), it occasionally returns 504/429 errors when it's
// under load or MyAnimeList itself is slow.
//
// Fallback: AniList's public GraphQL API — also keyless, and since it's
// a first-party database (not scraping anything), it's generally far
// more reliable. Used automatically whenever Jikan errors out or comes
// back with no match, so a Jikan outage doesn't take the command down.
const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANILIST_BASE = "https://graphql.anilist.co";

function truncate(text, max) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

function cleanAniListText(text) {
  if (!text) return "";
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<i>|<\/i>|<b>|<\/b>/gi, "")
    .replace(/~!|!~/g, "") // AniList spoiler markers
    .replace(/\s+/g, " ")
    .trim();
}

// --- Jikan fetchers ---
async function searchAnimeJikan(query) {
  const res = await axios.get(`${JIKAN_BASE}/anime`, {
    params: { q: query, limit: 1, sfw: true },
    timeout: 15000,
  });
  return res.data?.data?.[0] || null;
}

async function searchCharacterJikan(query) {
  const res = await axios.get(`${JIKAN_BASE}/characters`, {
    params: { q: query, limit: 1 },
    timeout: 15000,
  });
  return res.data?.data?.[0] || null;
}

// --- AniList fetchers ---
async function searchAnimeAniList(query) {
  const gql = `query ($search: String) {
    Media(search: $search, type: ANIME) {
      title { romaji english }
      description(asHtml: false)
      averageScore
      episodes
      status
      genres
      startDate { year month day }
      coverImage { large }
    }
  }`;
  const res = await axios.post(
    ANILIST_BASE,
    { query: gql, variables: { search: query } },
    { timeout: 15000, headers: { "Content-Type": "application/json" } }
  );
  return res.data?.data?.Media || null;
}

async function searchCharacterAniList(query) {
  const gql = `query ($search: String) {
    Character(search: $search) {
      name { full native }
      description(asHtml: false)
      image { large }
    }
  }`;
  const res = await axios.post(
    ANILIST_BASE,
    { query: gql, variables: { search: query } },
    { timeout: 15000, headers: { "Content-Type": "application/json" } }
  );
  return res.data?.data?.Character || null;
}

// --- Normalize both sources to a common shape ---
function normalizeAnimeFromJikan(anime) {
  return {
    title: anime.title_english || anime.title,
    altTitle: anime.title_english && anime.title_english !== anime.title ? anime.title : null,
    score: anime.score != null ? `${anime.score}/10` : "N/A",
    aired: anime.aired?.string || "Unknown",
    episodes: anime.episodes ?? "Unknown",
    status: anime.status || "Unknown",
    genres: (anime.genres || []).map((g) => g.name).join(", ") || "Unknown",
    synopsis: anime.synopsis,
    image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
    source: "MyAnimeList",
  };
}

function normalizeAnimeFromAniList(media) {
  const d = media.startDate;
  const aired = d?.year ? [d.year, d.month, d.day].filter(Boolean).join("-") : "Unknown";
  const english = media.title?.english;
  const romaji = media.title?.romaji;
  return {
    title: english || romaji,
    altTitle: english && romaji && english !== romaji ? romaji : null,
    score: media.averageScore != null ? `${media.averageScore}/100` : "N/A",
    aired,
    episodes: media.episodes ?? "Unknown",
    status: media.status || "Unknown",
    genres: (media.genres || []).join(", ") || "Unknown",
    synopsis: cleanAniListText(media.description),
    image: media.coverImage?.large,
    source: "AniList",
  };
}

function normalizeCharacterFromJikan(character) {
  return {
    name: character.name,
    altName: character.name_kanji || null,
    about: character.about,
    image: character.images?.jpg?.image_url,
    source: "MyAnimeList",
  };
}

function normalizeCharacterFromAniList(char) {
  return {
    name: char.name?.full,
    altName: char.name?.native || null,
    about: cleanAniListText(char.description),
    image: char.image?.large,
    source: "AniList",
  };
}

// --- Fetch with fallback: Jikan first, AniList if Jikan errors or misses ---
async function fetchAnimeWithFallback(query) {
  try {
    const anime = await searchAnimeJikan(query);
    if (anime) return normalizeAnimeFromJikan(anime);
  } catch (err) {
    console.error("Jikan anime search failed, falling back to AniList:", err.message);
  }
  try {
    const media = await searchAnimeAniList(query);
    if (media) return normalizeAnimeFromAniList(media);
  } catch (err) {
    console.error("AniList anime search also failed:", err.message);
  }
  return null;
}

async function fetchCharacterWithFallback(query) {
  try {
    const character = await searchCharacterJikan(query);
    if (character) return normalizeCharacterFromJikan(character);
  } catch (err) {
    console.error("Jikan character search failed, falling back to AniList:", err.message);
  }
  try {
    const char = await searchCharacterAniList(query);
    if (char) return normalizeCharacterFromAniList(char);
  } catch (err) {
    console.error("AniList character search also failed:", err.message);
  }
  return null;
}

function formatAnime(anime) {
  const altTitle = anime.altTitle ? ` (${anime.altTitle})` : "";
  return [
    `📺 *${anime.title}*${altTitle}`,
    "",
    `⭐ Score: ${anime.score}`,
    `📅 Aired: ${anime.aired}`,
    `🎬 Episodes: ${anime.episodes}`,
    `📊 Status: ${anime.status}`,
    `🏷️ Genres: ${anime.genres}`,
    "",
    truncate(anime.synopsis, 600) || "No synopsis available.",
    "",
    `_via ${anime.source}_`,
  ].join("\n");
}

function formatCharacter(character) {
  const altName = character.altName ? ` (${character.altName})` : "";
  return [
    `🎭 *${character.name}*${altName}`,
    "",
    truncate(character.about, 700) || "No bio available.",
    "",
    `_via ${character.source}_`,
  ].join("\n");
}

async function handleAnimeSearch(sock, jid, msg, query) {
  const anime = await fetchAnimeWithFallback(query);
  if (!anime) {
    return sock.sendMessage(
      jid,
      { text: `❌ No anime found for "${query}" (checked MyAnimeList and AniList).` },
      { quoted: msg }
    );
  }
  const caption = formatAnime(anime);
  if (anime.image) {
    await sock.sendMessage(jid, { image: { url: anime.image }, caption }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }
}

async function handleCharacterSearch(sock, jid, msg, query) {
  const character = await fetchCharacterWithFallback(query);
  if (!character) {
    return sock.sendMessage(
      jid,
      { text: `❌ No character found for "${query}" (checked MyAnimeList and AniList).` },
      { quoted: msg }
    );
  }
  const caption = formatCharacter(character);
  if (character.image) {
    await sock.sendMessage(jid, { image: { url: character.image }, caption }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
  }
}

module.exports = {
  name: "anime",
  description:
    `Search an anime by name, search a character with '!anime character <name>', ` +
    `or react with '!anime <type>' — types: ${REACTION_TYPES.join(", ")}.`,
  async execute({ sock, jid, msg, args }) {
    if (!args.length) {
      return sock.sendMessage(
        jid,
        {
          text: [
            "Usage:",
            "!anime <name> — search an anime",
            "!anime character <name> — search a character",
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
