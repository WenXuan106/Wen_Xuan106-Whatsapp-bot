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
