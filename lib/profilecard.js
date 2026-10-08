// Builds the player profile card as an SVG string, in the same style as the
// weather card (lib/weathercard.js): fixed 1600×900 canvas, dark blue
// gradient, accent-blue headings, icons drawn as plain shapes (no emoji, so
// rendering doesn't depend on installed emoji fonts).

const CARD_WIDTH = 1600;
const CARD_HEIGHT = 900;
const COLORS = {
  bgTop: "#0a1128",
  bgBottom: "#101c40",
  border: "#2c4a8c",
  accent: "#3b9eff",
  white: "#f4f6fb",
  muted: "#9aa8c7",
  cardBg: "#131f45",
  cardBorder: "#26386b",
  gold: "#fbbf24",
};

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fitFontSize(text, maxWidth, startSize, minSize) {
  // Rough estimate: bold sans-serif averages ~0.58em per character.
  let size = startSize;
  while (size > minSize && text.length * size * 0.58 > maxWidth) {
    size -= 2;
  }
  return size;
}

/** Image mime type from the file's first bytes, or null if it isn't one resvg can draw. */
function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.slice(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

// --- Small icons (each centered at cx,cy; s is a size scale factor) ---

function starIcon(cx, cy, s = 1, fill = COLORS.gold) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0 ? 14 : 6) * s;
    const angle = -Math.PI / 2 + (Math.PI / 5) * i;
    pts.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

function trophyIcon(cx, cy, s = 1, fill = COLORS.gold) {
  return `
    <path d="M ${cx - 9 * s} ${cy - 12 * s} h ${18 * s} v ${8 * s} a ${9 * s} ${9 * s} 0 0 1 -${18 * s} 0 z" fill="${fill}"/>
    <path d="M ${cx - 9 * s} ${cy - 9 * s} h -${5 * s} v ${3 * s} a ${5 * s} ${5 * s} 0 0 0 ${5 * s} ${5 * s}" fill="none" stroke="${fill}" stroke-width="${2.5 * s}" stroke-linecap="round"/>
    <path d="M ${cx + 9 * s} ${cy - 9 * s} h ${5 * s} v ${3 * s} a ${5 * s} ${5 * s} 0 0 1 -${5 * s} ${5 * s}" fill="none" stroke="${fill}" stroke-width="${2.5 * s}" stroke-linecap="round"/>
    <rect x="${cx - 2 * s}" y="${cy + 4 * s}" width="${4 * s}" height="${6 * s}" fill="${fill}"/>
    <rect x="${cx - 7 * s}" y="${cy + 10 * s}" width="${14 * s}" height="${3.5 * s}" rx="${1.5 * s}" fill="${fill}"/>
  `;
}

function checkIcon(cx, cy, s = 1, fill = "#4ade80") {
  return `<circle cx="${cx}" cy="${cy}" r="${13 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><polyline points="${cx - 6 * s},${cy} ${cx - 1.5 * s},${cy + 5 * s} ${cx + 7 * s},${cy - 5 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function targetIcon(cx, cy, s = 1, fill = COLORS.accent) {
  return `<circle cx="${cx}" cy="${cy}" r="${13 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><circle cx="${cx}" cy="${cy}" r="${6 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><circle cx="${cx}" cy="${cy}" r="${1.8 * s}" fill="${fill}"/>`;
}

function gamepadIcon(cx, cy, s = 1, fill = COLORS.accent) {
  return `
    <rect x="${cx - 16 * s}" y="${cy - 9 * s}" width="${32 * s}" height="${18 * s}" rx="${8 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/>
    <line x1="${cx - 8 * s}" y1="${cy - 3 * s}" x2="${cx - 8 * s}" y2="${cy + 3 * s}" stroke="${fill}" stroke-width="${2.5 * s}" stroke-linecap="round"/>
    <line x1="${cx - 11 * s}" y1="${cy}" x2="${cx - 5 * s}" y2="${cy}" stroke="${fill}" stroke-width="${2.5 * s}" stroke-linecap="round"/>
    <circle cx="${cx + 7 * s}" cy="${cy - 2 * s}" r="${1.8 * s}" fill="${fill}"/>
    <circle cx="${cx + 11 * s}" cy="${cy + 2 * s}" r="${1.8 * s}" fill="${fill}"/>
  `;
}

function calendarIcon(cx, cy, s = 1, fill = COLORS.accent) {
  return `<rect x="${cx - 13 * s}" y="${cy - 11 * s}" width="${26 * s}" height="${22 * s}" rx="${3 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><line x1="${cx - 13 * s}" y1="${cy - 3 * s}" x2="${cx + 13 * s}" y2="${cy - 3 * s}" stroke="${fill}" stroke-width="${3 * s}"/>`;
}

function shieldIcon(cx, cy, s = 1, fill = COLORS.muted) {
  return `<path d="M ${cx} ${cy - 13 * s} L ${cx + 11 * s} ${cy - 7 * s} L ${cx + 11 * s} ${cy + 3 * s} C ${cx + 11 * s} ${cy + 11 * s} ${cx} ${cy + 15 * s} ${cx} ${cy + 15 * s} C ${cx} ${cy + 15 * s} ${cx - 11 * s} ${cy + 11 * s} ${cx - 11 * s} ${cy + 3 * s} L ${cx - 11 * s} ${cy - 7 * s} Z" fill="none" stroke="${fill}" stroke-width="${2.5 * s}"/>`;
}

/**
 * Builds the full card SVG at a fixed 1600×900 (16:9) size.
 * @param {object} data
 * @param {string} data.botName
 * @param {string} data.name
 * @param {string} data.platform - "whatsapp" | "telegram"
 * @param {Buffer|null} data.avatar - profile picture bytes, or null for an initial-letter avatar
 * @param {number} data.level
 * @param {string} data.title
 * @param {number} data.points
 * @param {number} data.levelStart - points where this level begins
 * @param {number} data.levelEnd - points needed for the next level
 * @param {number|null} data.rank
 * @param {number} data.totalPlayers
 * @param {number} data.totalWins
 * @param {number|null} data.winRate - percent, or null if no games yet
 * @param {string|null} data.bestGame
 * @param {number|null} data.firstSeen - ms timestamp
 * @param {Array<{label:string, wins:number, losses:number, draws:number, points:number}>} data.games
 */
function buildProfileCardSvg(data) {
  const pad = 50;
  const innerWidth = CARD_WIDTH - pad * 2;

  const platformLabel = data.platform === "telegram" ? "TELEGRAM" : "WHATSAPP";
  const titleText = `${data.botName.toUpperCase()} PROFILE`;
  const titleSize = fitFontSize(titleText, innerWidth, 46, 26);

  let svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`;

  const avatarCx = 210;
  const avatarCy = 330;
  const avatarR = 112;

  svg += `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLORS.bgTop}"/>
        <stop offset="100%" stop-color="${COLORS.bgBottom}"/>
      </linearGradient>
      <clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
    </defs>
    <rect x="4" y="4" width="${CARD_WIDTH - 8}" height="${CARD_HEIGHT - 8}" rx="32" fill="url(#bg)" stroke="${COLORS.border}" stroke-width="2"/>
  `;

  // Title + platform
  svg += `<text x="${pad}" y="85" font-family="sans-serif" font-weight="700" font-size="${titleSize}" fill="${COLORS.accent}">${esc(titleText)}</text>`;
  svg += `<text x="${pad}" y="125" font-family="sans-serif" font-weight="700" font-size="28" fill="${COLORS.white}">${platformLabel} PLAYER</text>`;

  // Avatar: circular profile picture, or an initial-letter placeholder
  const avatarMime = sniffImageMime(data.avatar);
  if (avatarMime) {
    svg += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="${COLORS.cardBg}"/>`;
    svg += `<image href="data:${avatarMime};base64,${data.avatar.toString("base64")}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>`;
  } else {
    const initial = (Array.from(String(data.name).trim())[0] || "?").toUpperCase();
    svg += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="${COLORS.cardBg}"/>`;
    svg += `<text x="${avatarCx}" y="${avatarCy + 42}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="120" fill="${COLORS.accent}">${esc(initial)}</text>`;
  }
  svg += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 6}" fill="none" stroke="${COLORS.accent}" stroke-width="6"/>`;

  // Name, level, XP bar
  const textX = 380;
  const nameSize = fitFontSize(data.name, innerWidth - (textX - pad), 72, 36);
  svg += `<text x="${textX}" y="275" font-family="sans-serif" font-weight="800" font-size="${nameSize}" fill="${COLORS.white}">${esc(data.name)}</text>`;
  svg += `<text x="${textX}" y="332" font-family="sans-serif" font-weight="700" font-size="34" fill="${COLORS.accent}">LEVEL ${data.level}  •  ${esc(data.title.toUpperCase())}</text>`;

  const barX = textX;
  const barY = 352;
  const barW = 720;
  const barH = 26;
  const span = Math.max(1, data.levelEnd - data.levelStart);
  const progress = Math.min(1, Math.max(0, (data.points - data.levelStart) / span));
  svg += `<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${COLORS.cardBg}" stroke="${COLORS.cardBorder}" stroke-width="2"/>`;
  if (progress > 0) {
    const fillW = Math.max(barH, barW * progress);
    svg += `<rect x="${barX}" y="${barY}" width="${fillW.toFixed(1)}" height="${barH}" rx="${barH / 2}" fill="${COLORS.accent}"/>`;
  }
  svg += `<text x="${barX + barW + 24}" y="${barY + 21}" font-family="sans-serif" font-size="24" fill="${COLORS.muted}">${data.points} / ${data.levelEnd} pts</text>`;

  // Stats — two rows of three
  const statRow1Y = 440;
  const statRow2Y = 484;
  const colX = [textX, textX + 420, textX + 840];

  const stat = (x, y, iconFn, label) => {
    let out = iconFn(x + 14, y - 6, 0.9);
    out += `<text x="${x + 36}" y="${y}" font-family="sans-serif" font-size="24" fill="${COLORS.white}">${esc(label)}</text>`;
    return out;
  };

  const memberSince = data.firstSeen
    ? new Date(data.firstSeen).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "—";

  svg += stat(colX[0], statRow1Y, starIcon, `Points: ${data.points}`);
  svg += stat(colX[1], statRow1Y, trophyIcon, data.rank ? `Rank: #${data.rank} of ${data.totalPlayers}` : "Rank: Unranked");
  svg += stat(colX[2], statRow1Y, checkIcon, `Wins: ${data.totalWins}`);

  svg += stat(colX[0], statRow2Y, targetIcon, `Win rate: ${data.winRate === null ? "—" : data.winRate + "%"}`);
  svg += stat(colX[1], statRow2Y, gamepadIcon, `Best: ${data.bestGame || "—"}`);
  svg += stat(colX[2], statRow2Y, calendarIcon, `Joined: ${memberSince}`);

  // Divider
  const dividerY = 545;
  svg += `<line x1="${pad}" y1="${dividerY}" x2="${CARD_WIDTH - pad}" y2="${dividerY}" stroke="${COLORS.cardBorder}" stroke-width="2"/>`;

  // Game stats header
  const headerY = dividerY + 47;
  svg += gamepadIcon(pad + 18, headerY - 9, 0.9);
  svg += `<text x="${pad + 46}" y="${headerY}" font-family="sans-serif" font-weight="700" font-size="32" fill="${COLORS.accent}">GAME STATS</text>`;

  // Game cards — 3 columns × 2 rows (4 columns × 2 rows once there are more than 6 games)
  const cols = data.games.length > 6 ? 4 : 3;
  const gap = 24;
  const cardW = (innerWidth - gap * (cols - 1)) / cols;
  const cardH = 96;
  const cardsTop = headerY + 25;
  const footerY = CARD_HEIGHT - 35;

  const compact = cols === 4;
  data.games.slice(0, cols * 2).forEach((game, i) => {
    const x = pad + (i % cols) * (cardW + gap);
    const y = cardsTop + Math.floor(i / cols) * (cardH + 18);
    const played = game.wins + game.losses + game.draws;

    const parts = [`${game.points} pts`];
    if (game.losses) parts.push(`${game.losses} ${game.losses === 1 ? "loss" : "losses"}`);
    if (game.draws) parts.push(`${game.draws} ${game.draws === 1 ? "draw" : "draws"}`);
    const detail = played > 0 ? parts.join("  ·  ") : "Not played yet";

    svg += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="18" fill="${COLORS.cardBg}" stroke="${COLORS.cardBorder}" stroke-width="2"/>`;
    const winsSize = compact ? 44 : 52;
    const winsWidth = String(game.wins).length * winsSize * 0.62;
    const labelSize = fitFontSize(game.label, cardW - 48 - winsWidth - 10, 26, 16);
    svg += `<text x="${x + 24}" y="${y + 42}" font-family="sans-serif" font-weight="700" font-size="${labelSize}" fill="${COLORS.white}">${esc(game.label)}</text>`;
    // Shrink the detail line only as much as needed to stay clear of the "WINS" label.
    let detailSize = compact ? 19 : 21;
    while (detailSize > 12 && detail.length * detailSize * 0.5 > cardW - 48 - 60) detailSize -= 1;
    svg += `<text x="${x + 24}" y="${y + 78}" font-family="sans-serif" font-size="${detailSize}" fill="${COLORS.muted}">${esc(detail)}</text>`;
    svg += `<text x="${x + cardW - 24}" y="${y + 64}" text-anchor="end" font-family="sans-serif" font-weight="800" font-size="${winsSize}" fill="${game.wins > 0 ? COLORS.accent : COLORS.muted}">${game.wins}</text>`;
    svg += `<text x="${x + cardW - 24}" y="${y + 86}" text-anchor="end" font-family="sans-serif" font-size="18" fill="${COLORS.muted}">${game.wins === 1 ? "WIN" : "WINS"}</text>`;
  });

  // Footer
  svg += shieldIcon(pad + 12, footerY - 6, 1);
  svg += `<text x="${pad + 34}" y="${footerY}" font-family="sans-serif" font-size="22" fill="${COLORS.muted}">Powered by ${esc(data.botName)}</text>`;

  svg += `</svg>`;
  return svg;
}

module.exports = { buildProfileCardSvg };
