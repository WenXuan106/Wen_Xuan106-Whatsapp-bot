// !attp — turns text into a sticker, in one of three styles the sender picks from a menu:
//   1 = Normal (still picture)    2 = Rainbow (animated rainbow background)    3 = Pop-up (words pop in one by one)
// The flow: "!attp Hello" shows the menu and remembers the text for 60 seconds; the sender's next
// message "1", "2" or "3" (in the same chat) makes the sticker. The reply hooks live in lib/whatsapp.js and lib/telegram.js.
const { spawn } = require("child_process");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { addStickerExif } = require("./sticker");
const config = require("../config");

const MENU_TIMEOUT_MS = 60000;
const MAX_TEXT_LENGTH = 80;
const MAX_STICKER_BYTES = 480 * 1024; // WhatsApp refuses animated stickers much bigger than this
const MAX_PARALLEL_RENDERS = 2;
const SIZE = 512;

// ------------------------------------------------------------------ the menu

const pending = new Map(); // "chatId|senderId" -> { text, timer }
const keyOf = (chatId, senderId) => `${chatId}|${senderId}`;

function menuText(text) {
  return [
    "🎨 *ATTP Sticker Maker*",
    "━━━━━━━━━━━━━━",
    "📝 *Text:*",
    `"${text}"`,
    "━━━━━━━━━━━━━━",
    "*Choose sticker type:*",
    "",
    "1️⃣ *Normal Sticker*",
    "Static • No rainbow",
    "",
    "2️⃣ *Rainbow Sticker* 🌈",
    "Animated rainbow background",
    "",
    "3️⃣ *Pop-Up Sticker* 💥",
    "Animated popping word",
    "━━━━━━━━━━━━━━",
    "⏱ Reply with 1, 2, or 3",
    "⌛ Selection expires in 60 seconds.",
  ].join("\n");
}

/** Shows the menu and remembers what to make until the sender answers (or 60 seconds pass). */
async function startAttpMenu({ chatId, senderId, text, sendText }) {
  const key = keyOf(chatId, senderId);
  const old = pending.get(key);
  if (old) clearTimeout(old.timer);

  const timer = setTimeout(() => pending.delete(key), MENU_TIMEOUT_MS);
  if (timer.unref) timer.unref();
  pending.set(key, { text, timer });
  await sendText(menuText(text));
}

/** True for a message that is only 1, 2 or 3 (also "2️⃣"). Cheap check the platforms run before anything else. */
function looksLikeChoice(text) {
  return /^\s*[1-3][\uFE0F\u20E3]*\s*$/.test(String(text || ""));
}

/**
 * Called for every plain message. Returns true (and makes the sticker) only when this sender has a
 * menu open in this chat and the message is 1, 2 or 3; otherwise returns false and does nothing.
 */
async function handleAttpChoice({ chatId, senderId, text, platform, sendText, sendSticker, sendAnimation }) {
  if (!looksLikeChoice(text)) return false;
  const key = keyOf(chatId, senderId);
  const entry = pending.get(key);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pending.delete(key);
  const type = { 1: "normal", 2: "rainbow", 3: "popup" }[text.replace(/[^1-3]/g, "")];

  try {
    const { kind, buffer } = await queued(() => makeSticker(type, entry.text, platform));
    if (kind === "animation") await sendAnimation(buffer);
    else await sendSticker(buffer);
  } catch (err) {
    console.error("attp failed:", err.stack || err.message);
    await sendText("❌ Failed to generate the sticker.");
  }
  return true;
}

// -------------------------------------------------------------------- fonts

// Google Fonts that ship with the bot (fonts/google/). Each style has its own look.
const GOOGLE_FONT_DIR = path.join(__dirname, "..", "fonts", "google");
const GOOGLE_FONTS = {
  lilita: "LilitaOne-Regular.ttf",
  bangers: "Bangers-Regular.ttf",
  luckiest: "LuckiestGuy-Regular.ttf",
  chewy: "Chewy-Regular.ttf",
  marker: "PermanentMarker-Regular.ttf",
  pacifico: "Pacifico-Regular.ttf",
};
const STYLE_FONT = { normal: "lilita", rainbow: "bangers" };
const POPUP_FONTS = ["luckiest", "bangers", "chewy", "lilita", "marker", "pacifico"]; // one per popped word, in turn

const CJK_RE = /[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/;

// A plain system font that has most letters, used when a Google Font can't draw something (emoji, Chinese, ...).
function systemFont(text) {
  const cjk = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
  ];
  const latin =
    process.platform === "win32"
      ? ["C:/Windows/Fonts/arialbd.ttf"]
      : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"];
  const candidates = CJK_RE.test(text) ? [...cjk, ...latin] : latin;
  return candidates.find((f) => fsSync.existsSync(f)) || latin[0];
}

// Reads just enough of a .ttf file to know which characters it has and how wide each one is,
// so text can be fitted exactly and a font that is missing a character is never used for it.
const metricsCache = new Map();
function readMetrics(file) {
  if (metricsCache.has(file)) return metricsCache.get(file);
  let metrics = null;
  try {
    const buf = fsSync.readFileSync(file);
    if (buf.readUInt32BE(0) === 0x74746366) throw new Error("font collection"); // .ttc: not read, estimated instead
    const tables = {};
    const count = buf.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
      const o = 12 + i * 16;
      tables[buf.toString("latin1", o, o + 4)] = buf.readUInt32BE(o + 8);
    }
    const unitsPerEm = buf.readUInt16BE(tables.head + 18);
    const ascent = buf.readInt16BE(tables.hhea + 4);
    const descent = buf.readInt16BE(tables.hhea + 6);
    const lineGap = buf.readInt16BE(tables.hhea + 8);
    const hMetrics = buf.readUInt16BE(tables.hhea + 34);
    const advanceOf = (gid) => buf.readUInt16BE(tables.hmtx + Math.min(gid, hMetrics - 1) * 4);

    // cmap: prefer the full-Unicode table (format 12), else the basic one (format 4)
    const cmap = tables.cmap;
    let format4 = null;
    let format12 = null;
    const n = buf.readUInt16BE(cmap + 2);
    for (let i = 0; i < n; i++) {
      const platform = buf.readUInt16BE(cmap + 4 + i * 8);
      const offset = cmap + buf.readUInt32BE(cmap + 8 + i * 8);
      const format = buf.readUInt16BE(offset);
      if (format === 12) format12 = offset;
      else if (format === 4 && (platform === 3 || platform === 0) && format4 === null) format4 = offset;
    }
    const glyphOf = (cp) => {
      if (format12 !== null) {
        const groups = buf.readUInt32BE(format12 + 12);
        for (let g = 0; g < groups; g++) {
          const at = format12 + 16 + g * 12;
          const start = buf.readUInt32BE(at);
          const end = buf.readUInt32BE(at + 4);
          if (cp >= start && cp <= end) return buf.readUInt32BE(at + 8) + (cp - start);
        }
        return 0;
      }
      if (format4 === null || cp > 0xffff) return 0;
      const segCount = buf.readUInt16BE(format4 + 6) / 2;
      const endCodes = format4 + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const deltas = startCodes + segCount * 2;
      const rangeOffsets = deltas + segCount * 2;
      for (let i = 0; i < segCount; i++) {
        if (cp > buf.readUInt16BE(endCodes + i * 2)) continue;
        if (cp < buf.readUInt16BE(startCodes + i * 2)) return 0;
        const delta = buf.readInt16BE(deltas + i * 2);
        const rangeOffset = buf.readUInt16BE(rangeOffsets + i * 2);
        if (rangeOffset === 0) return (cp + delta) & 0xffff;
        const gid = buf.readUInt16BE(rangeOffsets + i * 2 + rangeOffset + (cp - buf.readUInt16BE(startCodes + i * 2)) * 2);
        return gid === 0 ? 0 : (gid + delta) & 0xffff;
      }
      return 0;
    };
    const natural = (ascent - descent + lineGap) / unitsPerEm;
    metrics = {
      lineRatio: Math.min(1.5, Math.max(1.1, natural)),
      has: (cp) => glyphOf(cp) !== 0,
      advance: (cp) => advanceOf(glyphOf(cp)) / unitsPerEm,
    };
  } catch (err) {
    metrics = null;
  }
  metricsCache.set(file, metrics);
  return metrics;
}

/** The font for a style: its Google Font if it can draw every character, else a system font. { file, metrics } */
function chooseFont(key, text) {
  const file = key ? path.join(GOOGLE_FONT_DIR, GOOGLE_FONTS[key] || "") : null;
  if (file && fsSync.existsSync(file)) {
    const metrics = readMetrics(file);
    if (metrics && [...text].every((ch) => /\s/.test(ch) || metrics.has(ch.codePointAt(0)))) return { file, metrics };
  }
  const fallback = systemFont(text);
  return { file: fallback, metrics: readMetrics(fallback) };
}

// ------------------------------------------------------------------- layout

/** Width of a piece of text in this font, including a little room for the outline. */
function textWidth(str, fontsize, font) {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (font.metrics && font.metrics.has(cp)) w += font.metrics.advance(cp);
    else w += CJK_RE.test(ch) ? 1.0 : 0.72; // estimate for characters the file can't tell us about
  }
  return w * fontsize + fontsize * 0.17;
}

/** Breaks text into lines no wider than maxWidth (breaking inside a word only if one word is too wide). */
function wrap(text, fontsize, maxWidth, font) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, fontsize, font) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let piece = "";
    for (const ch of word) {
      if (textWidth(piece + ch, fontsize, font) > maxWidth && piece) {
        lines.push(piece);
        piece = "";
      }
      piece += ch;
    }
    line = piece;
  }
  if (line) lines.push(line);
  return lines;
}

/** The biggest font size at which the text fits the sticker, without chopping words in half if it can be avoided. */
function layout(text, font, box = 456) {
  const ratio = font.metrics ? font.metrics.lineRatio : 1.25;
  const words = text.split(/\s+/).filter(Boolean);
  // First try to keep every word whole (as long as that still leaves the text a decent size),
  // otherwise let a very long word break across lines so the letters stay big.
  for (const allowSplit of [false, true]) {
    const smallest = allowSplit ? 20 : 56;
    for (let fontsize = 140; fontsize >= smallest; fontsize -= 4) {
      if (!allowSplit && words.some((w) => textWidth(w, fontsize, font) > box)) continue;
      const lines = wrap(text, fontsize, box, font);
      if (lines.length * fontsize * ratio <= box) return { lines, fontsize, ratio };
    }
  }
  return { lines: wrap(text, 20, box, font), fontsize: 20, ratio };
}

// ------------------------------------------------------------------ ffmpeg

function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function tempTextFile(content, made) {
  const file = path.join(os.tmpdir(), `attp-${crypto.randomUUID()}.txt`);
  await fs.writeFile(file, content, "utf8");
  made.push(file);
  return file;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    const errors = [];
    ff.stderr.on("data", (e) => errors.push(e));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}

// One drawtext per line of text (each centred on its own), the text read from a file so quotes, colons
// and emoji never need escaping. `enable` limits the layer to a moment in the animation.
async function textLayers({ lines, fontsize, ratio, font, color, border, enable, made }) {
  const lineHeight = Math.round(fontsize * ratio);
  const top = Math.round((SIZE - lines.length * lineHeight) / 2);
  const layers = [];
  for (let i = 0; i < lines.length; i++) {
    const file = await tempTextFile(lines[i], made);
    const parts = [
      `fontfile='${escapeFilterPath(font.file)}'`,
      `textfile='${escapeFilterPath(file)}'`,
      `fontcolor=${color}`,
      `borderw=${border}`,
      "bordercolor=black",
      `fontsize=${fontsize}`,
      "x=(w-text_w)/2",
      `y=${top + i * lineHeight}`,
    ];
    if (enable) parts.push(`enable='${enable}'`);
    layers.push(`drawtext=${parts.join(":")}`);
  }
  return layers;
}

const POP_COLORS = ["0xFF4D6D", "0xFFD23F", "0x3BCEAC", "0x4CC9F0", "0xB388FF", "0xFF9F1C"];

/**
 * Builds the ffmpeg input + filter for one sticker style.
 *   normal  - one still frame, white text with a black outline on a transparent background
 *   rainbow - moving rainbow stripes behind the text
 *   popup   - one word (or two or three, for long text) at a time, each popping in with a little bounce
 * `opaque` is for Telegram's mp4 animations, which can't be transparent.
 */
async function buildScene(type, text, opaque, made) {
  if (type === "normal") {
    const font = chooseFont(STYLE_FONT.normal, text);
    const { lines, fontsize, ratio } = layout(text, font);
    const layers = await textLayers({ lines, fontsize, ratio, font, color: "white", border: Math.max(3, Math.round(fontsize / 14)), made });
    return {
      animated: false,
      input: [`color=c=black@0.0:s=${SIZE}x${SIZE}:r=1:d=1`],
      filter: ["format=rgba", ...layers].join(","),
    };
  }

  if (type === "rainbow") {
    const font = chooseFont(STYLE_FONT.rainbow, text);
    const { lines, fontsize, ratio } = layout(text, font);
    const layers = await textLayers({ lines, fontsize, ratio, font, color: "white", border: Math.max(3, Math.round(fontsize / 12)), made });
    const wave = (shift) => `127.5*(1+sin(6.2832*((X+Y)/(W+H)*1.5-T*0.5)+${shift}))`;
    return {
      animated: true,
      // The stripes are smooth, so they are made at half size and scaled up (4x less work, smaller file).
      input: [`color=c=black:s=${SIZE / 2}x${SIZE / 2}:r=15:d=2`],
      filter: [
        "format=gbrp",
        `geq=r='${wave(0)}':g='${wave(2.0944)}':b='${wave(4.1888)}'`,
        `scale=${SIZE}:${SIZE}:flags=bicubic`,
        "format=rgba",
        ...layers,
      ].join(","),
    };
  }

  // pop-up: group the words into at most 8 short phrases shown one after another
  const words = text.split(/\s+/).filter(Boolean);
  const per = Math.max(1, Math.ceil(words.length / 8));
  const phrases = [];
  for (let i = 0; i < words.length; i += per) phrases.push(words.slice(i, i + per).join(" "));

  const step = 0.6;
  // [start, end, scale] — grow past full size, then settle (this is the "pop")
  const pop = [[0, 0.06, 0.35], [0.06, 0.12, 0.8], [0.12, 0.2, 1.18], [0.2, 0.28, 0.95], [0.28, step, 1.0]];
  const layers = [];
  for (let i = 0; i < phrases.length; i++) {
    const font = chooseFont(POPUP_FONTS[i % POPUP_FONTS.length], phrases[i]); // a different Google Font for each word
    const { lines, fontsize, ratio } = layout(phrases[i], font, 380); // smaller box leaves room for the overshoot
    const color = POP_COLORS[i % POP_COLORS.length];
    for (let idx = 0; idx < pop.length; idx++) {
      const [from, to, scale] = pop[idx];
      const start = (i * step + from).toFixed(2);
      const end = idx === pop.length - 1 && i === phrases.length - 1 ? 99 : (i * step + to).toFixed(2);
      const size = Math.max(10, Math.round(fontsize * scale));
      // start <= t < end, so two moments never show at once
      const enable = `gte(t\\,${start})*lt(t\\,${end})`;
      layers.push(...(await textLayers({ lines, fontsize: size, ratio, font, color, border: Math.max(3, Math.round(size / 12)), enable, made })));
    }
  }
  const duration = Math.min(6, phrases.length * step + 0.6);
  return {
    animated: true,
    input: [`color=c=${opaque ? "0x1B1B2F" : "black@0.0"}:s=${SIZE}x${SIZE}:r=15:d=${duration.toFixed(2)}`],
    filter: ["format=rgba", ...layers].join(","),
  };
}

async function renderWebp(scene) {
  const out = path.join(os.tmpdir(), `attp-${crypto.randomUUID()}.webp`);
  try {
    // Try a nice quality first, then smaller until it fits what WhatsApp accepts.
    for (const [quality, fps] of scene.animated ? [[60, 15], [40, 12], [25, 10]] : [[85, 1], [60, 1]]) {
      const args = ["-f", "lavfi", "-i", scene.input[0], "-vf", `${scene.filter}${scene.animated ? `,fps=${fps}` : ""}`];
      if (!scene.animated) args.push("-frames:v", "1");
      args.push("-c:v", "libwebp", "-lossless", "0", "-quality", String(quality), "-compression_level", "6", "-loop", "0", "-an", "-vsync", "0", "-pix_fmt", "yuva420p", out);
      await runFfmpeg(args);
      const data = await fs.readFile(out);
      if (data.length <= MAX_STICKER_BYTES) return data;
    }
    return await fs.readFile(out); // best effort: the smallest one we got
  } finally {
    fs.unlink(out).catch(() => {});
  }
}

// Telegram shows animated stickers only in its own format, so there the animation goes out as a looping mp4.
async function renderMp4(scene) {
  const out = path.join(os.tmpdir(), `attp-${crypto.randomUUID()}.mp4`);
  try {
    await runFfmpeg([
      "-f", "lavfi", "-i", scene.input[0],
      "-vf", `${scene.filter},format=yuv420p`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out,
    ]);
    return await fs.readFile(out);
  } finally {
    fs.unlink(out).catch(() => {});
  }
}

/** Makes the sticker. Returns { kind: "sticker" | "animation", buffer }. */
async function makeSticker(type, text, platform) {
  const made = [];
  try {
    const telegramAnimation = platform === "telegram" && type !== "normal";
    const scene = await buildScene(type, text, telegramAnimation, made);
    if (telegramAnimation) return { kind: "animation", buffer: await renderMp4(scene) };

    const webp = await renderWebp(scene);
    const buffer = platform === "telegram" ? webp : await addStickerExif(webp, { packname: config.BOT_NAME });
    return { kind: "sticker", buffer };
  } finally {
    for (const f of made) fs.unlink(f).catch(() => {});
  }
}

// At most two stickers are rendered at the same time; the rest wait their turn.
let running = 0;
const waiting = [];
async function queued(job) {
  if (running >= MAX_PARALLEL_RENDERS) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try {
    return await job();
  } finally {
    running--;
    const next = waiting.shift();
    if (next) next();
  }
}

module.exports = { startAttpMenu, handleAttpChoice, looksLikeChoice, makeSticker, menuText, MAX_TEXT_LENGTH };
