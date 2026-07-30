const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { addStickerExif } = require("../lib/sticker");
const config = require("../config");

const FONT_PATH =
  process.platform === "win32"
    ? "C:/Windows/Fonts/arialbd.ttf"
    : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%");
}

// Renders 1.8s of video where the text cycles red/blue/green — the "blink"
// effect — as raw mp4 bytes via ffmpeg's lavfi color source + drawtext filter.
function renderBlinkingVideo(text) {
  return new Promise((resolve, reject) => {
    const safeText = escapeDrawtext(text);
    const cycle = 0.3;
    const dur = 1.8;

    const layer = (color, enable) =>
      `drawtext=fontfile='${FONT_PATH}':text='${safeText}':fontcolor=${color}:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='${enable}'`;

    const filter = [
      layer("red", `lt(mod(t\\,${cycle})\\,0.1)`),
      layer("blue", `between(mod(t\\,${cycle})\\,0.1\\,0.2)`),
      layer("green", `gte(mod(t\\,${cycle})\\,0.2)`),
    ].join(",");

    const args = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=black:s=512x512:d=${dur}:r=20`,
      "-vf", filter,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart+frag_keyframe+empty_moov",
      "-t", String(dur),
      "-f", "mp4",
      "pipe:1",
    ];

    const ff = spawn("ffmpeg", args);
    const chunks = [];
    const errors = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (e) => errors.push(e));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}

// Pipes the rendered mp4 back through ffmpeg to produce an animated webp.
//
// This writes to a real temp file rather than piping to stdout. Animated
// WebP's RIFF container needs to go back and rewrite size fields in its
// header after all frames are encoded — that requires a seekable output,
// which a pipe can't provide. Piping this step (unlike the MP4 step above,
// which sidesteps the same problem with fragmented-mp4 flags) produces a
// WebP file with an incorrect/truncated header, which then fails to parse
// downstream with an error like "Reached end while reading chunk header".
function mp4ToAnimatedWebp(mp4Buffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `attp-${crypto.randomUUID()}.webp`);
    const args = [
      "-y",
      "-i", "pipe:0",
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15",
      "-c:v", "libwebp",
      "-preset", "default",
      "-loop", "0",
      "-vsync", "0",
      "-pix_fmt", "yuva420p",
      "-quality", "60",
      "-compression_level", "6",
      "-f", "webp",
      tmpFile,
    ];
    const ff = spawn("ffmpeg", args);
    const errors = [];
    ff.stderr.on("data", (e) => errors.push(e));
    ff.on("error", reject);
    ff.on("close", async (code) => {
      try {
        if (code !== 0) {
          throw new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`);
        }
        resolve(await fs.readFile(tmpFile));
      } catch (err) {
        reject(err);
      } finally {
        fs.unlink(tmpFile).catch(() => {}); // best-effort cleanup
      }
    });
    ff.stdin.write(mp4Buffer);
    ff.stdin.end();
  });
}

module.exports = {
  name: "attp",
  description: "Make an animated blinking-text sticker, e.g. !attp Hello",
  async execute({ sock, jid, msg, args }) {
    const text = args.join(" ").trim();
    if (!text) {
      return sock.sendMessage(jid, { text: "Usage: !attp <text>" }, { quoted: msg });
    }

    try {
      const mp4Buffer = await renderBlinkingVideo(text);
      const webpBuffer = await mp4ToAnimatedWebp(mp4Buffer);
      const stickerBuffer = await addStickerExif(webpBuffer, { packname: config.BOT_NAME });
      await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    } catch (err) {
      console.error("attp command failed:", err.stack || err.message);
      await sock.sendMessage(jid, { text: "❌ Failed to generate the sticker." }, { quoted: msg });
    }
  },
};
