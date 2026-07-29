const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { addStickerExif } = require("../lib/sticker");

const ANIMU_BASE = "https://api.some-random-api.com/animu";
const SUPPORTED = ["nom", "poke", "cry", "kiss", "pat", "hug", "wink", "face-palm", "quote"];

function normalizeType(input) {
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
        const stickerBuffer = await addStickerExif(webpBuffer, { packname: "Anime Stickers" });
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

async function sendAnimu(sock, jid, msg, type) {
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

module.exports = {
  name: "anime",
  description: `React with an anime GIF/sticker, e.g. !anime hug — types: ${SUPPORTED.join(", ")}`,
  async execute({ sock, jid, msg, args }) {
    const sub = normalizeType(args[0]);

    if (!sub) {
      return sock.sendMessage(jid, { text: `Usage: !anime <type>\nTypes: ${SUPPORTED.join(", ")}` }, { quoted: msg });
    }
    if (!SUPPORTED.includes(sub)) {
      return sock.sendMessage(
        jid,
        { text: `❌ Unsupported type: ${sub}. Try one of: ${SUPPORTED.join(", ")}` },
        { quoted: msg }
      );
    }

    try {
      await sendAnimu(sock, jid, msg, sub);
    } catch (err) {
      console.error("animu command failed:", err.message);
      await sock.sendMessage(jid, { text: "❌ An error occurred fetching that." }, { quoted: msg });
    }
  },
};
