// Builds the weather report card as an SVG string. Icons are drawn as
// plain shapes rather than emoji, so rendering doesn't depend on the
// host having any particular emoji font installed.
// Fixed 16:9 canvas — spacing is tuned to that exact size, not variable.

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
};

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Icons (each centered at cx,cy; s is a size scale factor, 1 == ~100px box) ---

function cloudShape(cx, cy, s, fill = COLORS.white) {
  return `
    <ellipse cx="${cx - 14 * s}" cy="${cy}" rx="${22 * s}" ry="${17 * s}" fill="${fill}"/>
    <ellipse cx="${cx + 10 * s}" cy="${cy - 6 * s}" rx="${16 * s}" ry="${13 * s}" fill="${fill}"/>
    <ellipse cx="${cx + 2 * s}" cy="${cy + 4 * s}" rx="${29 * s}" ry="${14 * s}" fill="${fill}"/>
  `;
}

function rainLines(cx, cy, s, count = 3) {
  let out = "";
  const startX = cx - ((count - 1) * 10 * s) / 2;
  for (let i = 0; i < count; i++) {
    const x = startX + i * 10 * s;
    out += `<line x1="${x}" y1="${cy + 15 * s}" x2="${x - 5 * s}" y2="${cy + 27 * s}" stroke="#60a5fa" stroke-width="${3 * s}" stroke-linecap="round"/>`;
  }
  return out;
}

function snowDots(cx, cy, s, count = 3, fill = COLORS.white) {
  let out = "";
  const startX = cx - ((count - 1) * 10 * s) / 2;
  for (let i = 0; i < count; i++) {
    const x = startX + i * 10 * s;
    out += `<circle cx="${x}" cy="${cy + 20 * s}" r="${2.5 * s}" fill="${fill}"/>`;
  }
  return out;
}

function boltShape(cx, cy, s, fill = "#fbbf24") {
  const pts = [
    [cx + 2 * s, cy + 10 * s],
    [cx - 6 * s, cy + 24 * s],
    [cx - 1 * s, cy + 24 * s],
    [cx - 5 * s, cy + 36 * s],
    [cx + 8 * s, cy + 18 * s],
    [cx + 2 * s, cy + 18 * s],
  ];
  return `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}"/>`;
}

function sunShape(cx, cy, s, fill = "#fbbf24") {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const angle = ((Math.PI * 2) / 8) * i;
    const x1 = cx + Math.cos(angle) * 24 * s;
    const y1 = cy + Math.sin(angle) * 24 * s;
    const x2 = cx + Math.cos(angle) * 34 * s;
    const y2 = cy + Math.sin(angle) * 34 * s;
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fill}" stroke-width="${4 * s}" stroke-linecap="round"/>`;
  }
  return `${rays}<circle cx="${cx}" cy="${cy}" r="${18 * s}" fill="${fill}"/>`;
}

function fogLines(cx, cy, s, fill = COLORS.muted) {
  let out = "";
  for (let i = 0; i < 3; i++) {
    const y = cy - 10 * s + i * 10 * s;
    out += `<line x1="${cx - 30 * s}" y1="${y}" x2="${cx + 30 * s}" y2="${y}" stroke="${fill}" stroke-width="${4 * s}" stroke-linecap="round"/>`;
  }
  return out;
}

/** Main weather icon (cloud/sun/etc.), centered in a size×size box at x,y. */
function weatherIcon(condition, x, y, size) {
  const s = size / 100;
  const cx = x + size / 2;
  const cy = y + size / 2;
  switch (condition) {
    case "Clear":
      return sunShape(cx, cy, s);
    case "Clouds":
      return cloudShape(cx, cy, s);
    case "Rain":
      return cloudShape(cx, cy, s) + rainLines(cx, cy, s, 4);
    case "Drizzle":
      return cloudShape(cx, cy, s) + rainLines(cx, cy, s, 3);
    case "Thunderstorm":
      return cloudShape(cx, cy, s) + boltShape(cx, cy, s);
    case "Snow":
      return cloudShape(cx, cy, s) + snowDots(cx, cy, s, 3, "#e2e8f0");
    case "Mist":
    case "Fog":
    case "Haze":
    case "Smoke":
    case "Dust":
      return fogLines(cx, cy, s);
    default:
      return cloudShape(cx, cy, s);
  }
}

// --- Small stat icons ---
function dropletIcon(cx, cy, s = 1, fill = "#60a5fa") {
  return `<path d="M ${cx} ${cy - 13 * s} C ${cx + 11 * s} ${cy - 1 * s} ${cx + 10 * s} ${cy + 12 * s} ${cx} ${cy + 12 * s} C ${cx - 10 * s} ${cy + 12 * s} ${cx - 11 * s} ${cy - 1 * s} ${cx} ${cy - 13 * s} Z" fill="${fill}"/>`;
}
function windIcon(cx, cy, s = 1, fill = COLORS.muted) {
  return `
    <path d="M ${cx - 16 * s} ${cy - 5 * s} h ${18 * s} a ${4.5 * s} ${4.5 * s} 0 1 0 -${4.5 * s} -${4.5 * s}" stroke="${fill}" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>
    <path d="M ${cx - 16 * s} ${cy + 5 * s} h ${24 * s} a ${4.5 * s} ${4.5 * s} 0 1 1 -${4.5 * s} ${4.5 * s}" stroke="${fill}" stroke-width="${3 * s}" fill="none" stroke-linecap="round"/>
  `;
}
function gaugeIcon(cx, cy, s = 1, fill = COLORS.muted) {
  return `<circle cx="${cx}" cy="${cy}" r="${13 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><line x1="${cx}" y1="${cy}" x2="${cx + 7 * s}" y2="${cy - 7 * s}" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round"/>`;
}
function sunriseIcon(cx, cy, s = 1, fill = "#fbbf24") {
  return `
    <line x1="${cx - 15 * s}" y1="${cy + 8 * s}" x2="${cx + 15 * s}" y2="${cy + 8 * s}" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round"/>
    <path d="M ${cx - 11 * s} ${cy + 8 * s} A ${11 * s} ${11 * s} 0 0 1 ${cx + 11 * s} ${cy + 8 * s}" fill="${fill}"/>
    <polyline points="${cx - 4 * s},${cy - 6 * s} ${cx},${cy - 12 * s} ${cx + 4 * s},${cy - 6 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}
function sunsetIcon(cx, cy, s = 1, fill = "#fb923c") {
  return `
    <line x1="${cx - 15 * s}" y1="${cy + 8 * s}" x2="${cx + 15 * s}" y2="${cy + 8 * s}" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round"/>
    <path d="M ${cx - 11 * s} ${cy + 8 * s} A ${11 * s} ${11 * s} 0 0 1 ${cx + 11 * s} ${cy + 8 * s}" fill="${fill}"/>
    <polyline points="${cx - 4 * s},${cy - 12 * s} ${cx},${cy - 6 * s} ${cx + 4 * s},${cy - 12 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}
function moonIcon(cx, cy, s = 1, fill = "#e2e8f0") {
  return `<circle cx="${cx}" cy="${cy}" r="${11 * s}" fill="${fill}"/><circle cx="${cx + 5 * s}" cy="${cy - 2 * s}" r="${10 * s}" fill="${COLORS.cardBg}"/>`;
}
function calendarIcon(cx, cy, s = 1, fill = COLORS.accent) {
  return `<rect x="${cx - 13 * s}" y="${cy - 11 * s}" width="${26 * s}" height="${22 * s}" rx="${3 * s}" fill="none" stroke="${fill}" stroke-width="${3 * s}"/><line x1="${cx - 13 * s}" y1="${cy - 3 * s}" x2="${cx + 13 * s}" y2="${cy - 3 * s}" stroke="${fill}" stroke-width="${3 * s}"/>`;
}
function shieldIcon(cx, cy, s = 1, fill = COLORS.muted) {
  return `<path d="M ${cx} ${cy - 13 * s} L ${cx + 11 * s} ${cy - 7 * s} L ${cx + 11 * s} ${cy + 3 * s} C ${cx + 11 * s} ${cy + 11 * s} ${cx} ${cy + 15 * s} ${cx} ${cy + 15 * s} C ${cx} ${cy + 15 * s} ${cx - 11 * s} ${cy + 11 * s} ${cx - 11 * s} ${cy + 3 * s} L ${cx - 11 * s} ${cy - 7 * s} Z" fill="none" stroke="${fill}" stroke-width="${2.5 * s}"/>`;
}
function raindropMini(cx, cy, s = 0.6, fill = "#60a5fa") {
  return dropletIcon(cx, cy, s, fill);
}

function fitFontSize(text, maxWidth, startSize, minSize) {
  // Rough estimate: bold sans-serif averages ~0.58em per character.
  let size = startSize;
  while (size > minSize && text.length * size * 0.58 > maxWidth) {
    size -= 2;
  }
  return size;
}

/**
 * Builds the full card SVG at a fixed 1600×900 (16:9) size.
 * @param {object} data
 * @param {string} data.botName
 * @param {string} data.location
 * @param {number} data.tempC
 * @param {string} data.condition - OpenWeather "main" value, e.g. "Rain"
 * @param {string} data.description - human-readable, e.g. "light drizzle"
 * @param {number} data.humidity
 * @param {number} data.windKmh
 * @param {number} data.pressure
 * @param {string} data.sunrise - pre-formatted time string
 * @param {string} data.sunset - pre-formatted time string
 * @param {string} data.moonPhaseName
 * @param {Array<{label:string, condition:string, description:string, min:number, max:number, pop:number}>} data.outlookDays
 */
function buildWeatherCardSvg(data) {
  const pad = 50;
  const innerWidth = CARD_WIDTH - pad * 2;

  const titleText = `${data.botName.toUpperCase()} WEATHER`;
  const titleSize = fitFontSize(titleText, innerWidth, 46, 26);

  let svg = `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`;

  svg += `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLORS.bgTop}"/>
        <stop offset="100%" stop-color="${COLORS.bgBottom}"/>
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="${CARD_WIDTH - 8}" height="${CARD_HEIGHT - 8}" rx="32" fill="url(#bg)" stroke="${COLORS.border}" stroke-width="2"/>
  `;

  // Title + location
  svg += `<text x="${pad}" y="85" font-family="sans-serif" font-weight="700" font-size="${titleSize}" fill="${COLORS.accent}">${esc(titleText)}</text>`;
  svg += `<text x="${pad}" y="125" font-family="sans-serif" font-weight="700" font-size="28" fill="${COLORS.white}">${esc(data.location)}</text>`;

  // Icon + big temp + condition
  const iconBoxY = 150;
  svg += weatherIcon(data.condition, pad, iconBoxY, 110);
  svg += `<text x="${pad + 140}" y="${iconBoxY + 78}" font-family="sans-serif" font-weight="800" font-size="78" fill="${COLORS.white}">${Math.round(data.tempC)}°C</text>`;
  svg += raindropMini(pad + 155, iconBoxY + 113, 0.6);
  svg += `<text x="${pad + 172}" y="${iconBoxY + 121}" font-family="sans-serif" font-size="24" fill="${COLORS.muted}">${esc(data.description)}</text>`;

  // Stats — two rows of three
  const statRow1Y = 330;
  const statRow2Y = 372;
  const colX = [pad, pad + innerWidth / 3, pad + (2 * innerWidth) / 3];

  const stat = (x, y, iconFn, label) => {
    let out = iconFn(x + 14, y - 6, 0.9);
    out += `<text x="${x + 36}" y="${y}" font-family="sans-serif" font-size="24" fill="${COLORS.white}">${esc(label)}</text>`;
    return out;
  };

  svg += stat(colX[0], statRow1Y, dropletIcon, `Humidity: ${data.humidity}%`);
  svg += stat(colX[1], statRow1Y, windIcon, `Wind: ${data.windKmh} km/h`);
  svg += stat(colX[2], statRow1Y, gaugeIcon, `Pressure: ${data.pressure} hPa`);

  svg += stat(colX[0], statRow2Y, sunriseIcon, `Sunrise: ${data.sunrise}`);
  svg += stat(colX[1], statRow2Y, sunsetIcon, `Sunset: ${data.sunset}`);
  svg += stat(colX[2], statRow2Y, moonIcon, data.moonPhaseName);

  // Divider
  const dividerY = statRow2Y + 35;
  svg += `<line x1="${pad}" y1="${dividerY}" x2="${CARD_WIDTH - pad}" y2="${dividerY}" stroke="${COLORS.cardBorder}" stroke-width="2"/>`;

  // 3-day outlook header
  const outlookHeaderY = dividerY + 42;
  svg += calendarIcon(pad + 14, outlookHeaderY - 9, 0.9);
  svg += `<text x="${pad + 36}" y="${outlookHeaderY}" font-family="sans-serif" font-weight="700" font-size="32" fill="${COLORS.accent}">3-DAY OUTLOOK</text>`;

  // Day cards
  const dayCount = Math.max(1, data.outlookDays.length);
  const gap = 24;
  const dayCardWidth = (innerWidth - gap * (dayCount - 1)) / dayCount;
  const dayCardsTop = outlookHeaderY + 25;
  const footerY = CARD_HEIGHT - 35;
  const dayCardHeight = footerY - dayCardsTop - 35;

  data.outlookDays.forEach((day, i) => {
    const x = pad + i * (dayCardWidth + gap);
    const y = dayCardsTop;
    svg += `<rect x="${x}" y="${y}" width="${dayCardWidth}" height="${dayCardHeight}" rx="18" fill="${COLORS.cardBg}" stroke="${COLORS.cardBorder}" stroke-width="2"/>`;
    svg += `<text x="${x + 24}" y="${y + 42}" font-family="sans-serif" font-weight="700" font-size="28" fill="${COLORS.white}">${esc(day.label)}</text>`;
    svg += weatherIcon(day.condition, x + 20, y + 56, 60);
    svg += `<text x="${x + 96}" y="${y + 96}" font-family="sans-serif" font-weight="700" font-size="28" fill="${COLORS.white}">${day.max}° / ${day.min}°</text>`;
    svg += raindropMini(x + 32, y + 144, 0.6);
    svg += `<text x="${x + 50}" y="${y + 150}" font-family="sans-serif" font-size="21" fill="${COLORS.muted}">${esc(day.description)}</text>`;
    svg += raindropMini(x + 32, y + 178, 0.6);
    svg += `<text x="${x + 50}" y="${y + 184}" font-family="sans-serif" font-size="21" fill="${COLORS.muted}">Rain: ${day.pop}%</text>`;
  });

  // Footer
  svg += shieldIcon(pad + 12, footerY - 6, 1);
  svg += `<text x="${pad + 34}" y="${footerY}" font-family="sans-serif" font-size="22" fill="${COLORS.muted}">Powered by ${esc(data.botName)}</text>`;

  svg += `</svg>`;
  return svg;
}

module.exports = { buildWeatherCardSvg };
