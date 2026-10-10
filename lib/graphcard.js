// Draws a Desmos-style graph image (as SVG, which the !desmos command turns
// into a PNG with resvg — the same way the weather and profile cards work).
//
// Nothing here uses eval(): the math is parsed by a small hand-written parser
// and only ever calls the whitelisted functions below, so a chat message can
// never run code on the bot.

const MAX_EXPRESSIONS = 6;
const MAX_EXPR_LENGTH = 120;
const SAMPLES = 1200;

const SIZE = 1000; // the plot is a SIZE x SIZE square
const LEGEND_ROW = 46;

const COLORS = {
  bg: "#ffffff",
  minor: "#ececec",
  major: "#d4d4d4",
  axis: "#444444",
  label: "#555555",
  border: "#bdbdbd",
  text: "#222222",
  muted: "#888888",
};

// The same colours Desmos uses for its first six curves.
const CURVE_COLORS = ["#c74440", "#2d70b3", "#388c46", "#6042a6", "#fa7e19", "#000000"];

// ---------------------------------------------------------------- math

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10, // like Desmos: log is base 10, ln is natural
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

// Longest names first so "exp" is read as exp, not "e" + "x" + "p".
const KNOWN_NAMES = [...Object.keys(FUNCTIONS), "pi"].sort((a, b) => b.length - a.length);

/** Like Math.pow, but x^(1/3) of a negative number gives the real cube root (as Desmos does). */
function power(base, exponent) {
  if (base >= 0 || Number.isInteger(exponent)) return Math.pow(base, exponent);
  for (let q = 1; q <= 25; q++) {
    const p = exponent * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) {
      if (q % 2 === 0) return NaN; // even root of a negative number
      return (Math.round(p) % 2 === 0 ? 1 : -1) * Math.pow(-base, exponent);
    }
  }
  return NaN;
}

function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\*\*/g, "^")
    .replace(/\bf\s*\(\s*x\s*\)\s*=/g, "y=");
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new Error(`I couldn't read the number near "${src.slice(i, i + 6)}".`);
      tokens.push({ type: "num", value: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/.test(ch)) {
      // A run of letters like "xsin" or "3pi" is split into known names / single letters.
      const run = /^[a-z]+/.exec(src.slice(i))[0];
      let j = 0;
      while (j < run.length) {
        const name = KNOWN_NAMES.find((n) => run.startsWith(n, j));
        const id = name || run[j];
        tokens.push({ type: "id", value: id });
        j += id.length;
      }
      i += run.length;
    } else if ("+-*/^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else {
      throw new Error(`I don't understand "${ch}".`);
    }
  }
  return tokens;
}

/**
 * Turns an expression in x (like "2x^2 - 3sin(x)") into a JS function of x.
 * Throws an Error with a user-friendly message if it can't be read.
 */
function compileExpression(source) {
  const tokens = tokenize(normalise(source));
  if (tokens.length === 0) throw new Error("That expression is empty.");

  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek()?.type === "op" && peek().value === v;

  function startsFactor(tok) {
    return tok && (tok.type === "num" || tok.type === "id" || (tok.type === "op" && tok.value === "("));
  }

  function parseExpr() {
    let left = parseTerm();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      const l = left;
      left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      let right;
      let op = "*";
      if (isOp("*") || isOp("/")) {
        op = tokens[pos++].value;
        right = parseUnary();
      } else if (startsFactor(peek())) {
        right = parsePower(); // implicit multiplication: 2x, 2(x+1), (x+1)(x-1)
      } else {
        return left;
      }
      const l = left;
      const r = right;
      left = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
    }
  }

  function parseUnary() {
    if (isOp("-")) {
      pos++;
      const inner = parseUnary();
      return (x) => -inner(x);
    }
    if (isOp("+")) {
      pos++;
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (isOp("^")) {
      pos++;
      const exponent = parseUnary(); // right-associative, allows 2^-x
      return (x) => power(base(x), exponent(x));
    }
    return base;
  }

  function parsePrimary() {
    const tok = tokens[pos++];
    if (!tok) throw new Error("The expression ends too early.");

    if (tok.type === "num") {
      const v = tok.value;
      return () => v;
    }

    if (tok.type === "op" && tok.value === "(") {
      const inner = parseExpr();
      if (!isOp(")")) throw new Error('A bracket "(" is never closed.');
      pos++;
      return inner;
    }

    if (tok.type === "id") {
      if (tok.value === "x") return (x) => x;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, tok.value)) {
        const v = CONSTANTS[tok.value];
        return () => v;
      }
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, tok.value)) {
        const fn = FUNCTIONS[tok.value];
        // sin(x) and also the lazy "sin x" form
        const arg = isOp("(") ? parsePrimary() : parsePower();
        return (x) => fn(arg(x));
      }
      throw new Error(`I don't know "${tok.value}" — only x is allowed as a variable.`);
    }

    throw new Error(`Unexpected "${tok.value}".`);
  }

  const fn = parseExpr();
  if (pos < tokens.length) {
    const left = tokens[pos];
    throw new Error(left.value === ")" ? 'There\'s a stray ")".' : `Unexpected "${left.value}".`);
  }
  return fn;
}

// ------------------------------------------------------------- request

function parseWindow(text) {
  // "x:-5..5" and "y:-2..2" at the end of the message set the visible window.
  const NUM = "(-?\\d+(?:\\.\\d+)?)";
  const win = {};
  const rest = text.replace(new RegExp(`\\b([xy])\\s*:\\s*${NUM}\\s*(?:\\.\\.|to)\\s*${NUM}`, "gi"), (_, axis, a, b) => {
    let lo = parseFloat(a);
    let hi = parseFloat(b);
    if (lo > hi) [lo, hi] = [hi, lo];
    win[axis.toLowerCase()] = [lo, hi];
    return " ";
  });
  return { win, rest };
}

/**
 * Reads the text after "!desmos". Returns { curves: [{label, fn}], window } or
 * throws an Error with a message that is safe to show to the user.
 */
function parseGraphRequest(input) {
  const { win, rest } = parseWindow(String(input || ""));

  for (const key of ["x", "y"]) {
    if (win[key] && win[key][0] === win[key][1]) {
      throw new Error(`The ${key} range needs two different numbers, like ${key}:-5..5`);
    }
  }

  const pieces = rest
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (pieces.length === 0) throw new Error("Give me something to graph.");
  if (pieces.length > MAX_EXPRESSIONS) throw new Error(`That's too many — I can graph up to ${MAX_EXPRESSIONS} at once.`);

  const curves = pieces.map((piece) => {
    if (piece.length > MAX_EXPR_LENGTH) throw new Error("One of those expressions is too long.");
    const body = normalise(piece).replace(/^\s*y\s*=\s*/, "");
    if (body.includes("=")) {
      throw new Error('I can only graph things like y = f(x) for now (no "=" inside the formula).');
    }
    try {
      return { label: `y = ${body.trim()}`, fn: compileExpression(body) };
    } catch (err) {
      throw new Error(`"${piece}" — ${err.message}`);
    }
  });

  return { curves, window: win };
}

// ------------------------------------------------------------ drawing

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function fmt(v) {
  if (Math.abs(v) < 1e-12) return "0";
  const s = Number(v.toPrecision(10)).toString();
  return s.length > 8 ? Number(v.toPrecision(4)).toExponential().replace("e+", "e") : s;
}

/** A "nice" grid step (1, 2 or 5 times a power of ten) giving about 8–12 lines. */
function niceStep(span) {
  const rough = span / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / mag;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  const step = nice * mag;
  const minorDivisions = nice === 2 ? 4 : 5;
  return { step, minor: step / minorDivisions };
}

function sampleCurve(fn, xMin, xMax) {
  const points = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = xMin + ((xMax - xMin) * i) / SAMPLES;
    let y;
    try {
      y = fn(x);
    } catch {
      y = NaN;
    }
    points.push({ x, y: Number.isFinite(y) ? y : NaN });
  }
  return points;
}

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** Picks a y range that shows the interesting part of the curves when the user didn't give one. */
function autoYRange(allPoints) {
  const ys = allPoints.filter((p) => Number.isFinite(p.y) && Math.abs(p.y) < 1e9).map((p) => p.y);
  if (ys.length === 0) return [-10, 10];
  ys.sort((a, b) => a - b);

  let lo = ys[0];
  let hi = ys[ys.length - 1];
  const qLo = quantile(ys, 0.03);
  const qHi = quantile(ys, 0.97);
  // If a few points blow up (tan, 1/x) ignore them so the rest stays readable.
  if (hi - lo > 50 * (qHi - qLo)) {
    lo = qLo;
    hi = qHi;
  }
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function buildGraphSvg({ curves, window: win = {} }) {
  const hasX = !!win.x;
  const hasY = !!win.y;
  const [xMin, xMax] = win.x || [-10, 10];

  const sampled = curves.map((c) => sampleCurve(c.fn, xMin, xMax));
  const [yMin, yMax] = hasY ? win.y : hasX ? autoYRange(sampled.flat()) : [-10, 10];

  const px = (x) => ((x - xMin) / (xMax - xMin)) * SIZE;
  const py = (y) => SIZE - ((y - yMin) / (yMax - yMin)) * SIZE;

  const legendH = 24 + curves.length * LEGEND_ROW;
  const height = SIZE + legendH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${height}" viewBox="0 0 ${SIZE} ${height}">`;
  svg += `<defs><clipPath id="plot"><rect x="0" y="0" width="${SIZE}" height="${SIZE}"/></clipPath></defs>`;
  svg += `<rect width="${SIZE}" height="${height}" fill="${COLORS.bg}"/>`;

  // Grid
  const gx = niceStep(xMax - xMin);
  const gy = niceStep(yMax - yMin);
  const lines = (min, max, step, vertical, color, width) => {
    let out = "";
    const first = Math.ceil(min / step - 1e-9);
    const last = Math.floor(max / step + 1e-9);
    for (let k = first; k <= last; k++) {
      const v = k * step;
      if (vertical) {
        const x = round1(px(v));
        out += `<line x1="${x}" y1="0" x2="${x}" y2="${SIZE}" stroke="${color}" stroke-width="${width}"/>`;
      } else {
        const y = round1(py(v));
        out += `<line x1="0" y1="${y}" x2="${SIZE}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`;
      }
    }
    return out;
  };
  svg += lines(xMin, xMax, gx.minor, true, COLORS.minor, 1);
  svg += lines(yMin, yMax, gy.minor, false, COLORS.minor, 1);
  svg += lines(xMin, xMax, gx.step, true, COLORS.major, 1.5);
  svg += lines(yMin, yMax, gy.step, false, COLORS.major, 1.5);

  // Axes
  const axisX = Math.min(SIZE, Math.max(0, py(0))); // where the x-axis sits (clamped to the edge)
  const axisY = Math.min(SIZE, Math.max(0, px(0)));
  if (yMin <= 0 && yMax >= 0) svg += `<line x1="0" y1="${round1(axisX)}" x2="${SIZE}" y2="${round1(axisX)}" stroke="${COLORS.axis}" stroke-width="2.5"/>`;
  if (xMin <= 0 && xMax >= 0) svg += `<line x1="${round1(axisY)}" y1="0" x2="${round1(axisY)}" y2="${SIZE}" stroke="${COLORS.axis}" stroke-width="2.5"/>`;

  // Axis numbers (with a white halo so they stay readable on top of curves)
  const label = (x, y, text, anchor) => {
    const attrs = `x="${round1(x)}" y="${round1(y)}" text-anchor="${anchor}" font-family="sans-serif" font-size="20"`;
    return (
      `<text ${attrs} fill="none" stroke="${COLORS.bg}" stroke-width="5" stroke-linejoin="round">${esc(text)}</text>` +
      `<text ${attrs} fill="${COLORS.label}">${esc(text)}</text>`
    );
  };
  const firstX = Math.ceil(xMin / gx.step - 1e-9);
  const lastX = Math.floor(xMax / gx.step + 1e-9);
  for (let k = firstX; k <= lastX; k++) {
    if (k === 0) continue;
    const x = px(k * gx.step);
    if (x < 24 || x > SIZE - 24) continue;
    const y = Math.min(SIZE - 8, axisX + 24);
    svg += label(x, y, fmt(k * gx.step), "middle");
  }
  const firstY = Math.ceil(yMin / gy.step - 1e-9);
  const lastY = Math.floor(yMax / gy.step + 1e-9);
  for (let k = firstY; k <= lastY; k++) {
    if (k === 0) continue;
    const y = py(k * gy.step);
    if (y < 20 || y > SIZE - 20) continue;
    const onRight = axisY > SIZE - 70;
    const x = onRight ? axisY - 8 : Math.max(8, axisY + 8);
    svg += label(x, y + 7, fmt(k * gy.step), onRight ? "end" : "start");
  }
  if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
    svg += label(axisY - 8, axisX + 24, "0", "end");
  }

  // Curves
  svg += `<g clip-path="url(#plot)" fill="none" stroke-linejoin="round" stroke-linecap="round">`;
  sampled.forEach((points, index) => {
    const color = CURVE_COLORS[index % CURVE_COLORS.length];
    const CLAMP = 1e5;
    let d = "";
    let penDown = false;
    let prev = null;

    for (const p of points) {
      if (!Number.isFinite(p.y)) {
        penDown = false;
        prev = null;
        continue;
      }
      const sx = px(p.x);
      const sy = Math.max(-CLAMP, Math.min(CLAMP, py(p.y)));

      // Break the line across an asymptote (jumping from far above the window to far below it).
      const jumps = prev && ((prev.sy < 0 && sy > SIZE) || (prev.sy > SIZE && sy < 0));
      if (!penDown || jumps) {
        d += `M${round1(sx)} ${round1(sy)}`;
        penDown = true;
      } else {
        d += `L${round1(sx)} ${round1(sy)}`;
      }
      prev = { sy };
    }

    if (d) svg += `<path d="${d}" stroke="${color}" stroke-width="4.5"/>`;
  });
  svg += `</g>`;

  // Frame
  svg += `<rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" fill="none" stroke="${COLORS.border}" stroke-width="2"/>`;

  // Legend
  curves.forEach((curve, index) => {
    const color = CURVE_COLORS[index % CURVE_COLORS.length];
    const cy = SIZE + 24 + index * LEGEND_ROW + LEGEND_ROW / 2;
    let text = curve.label;
    if (text.length > 58) text = text.slice(0, 57) + "…";
    svg += `<line x1="30" y1="${cy}" x2="80" y2="${cy}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
    svg += `<text x="100" y="${cy + 9}" font-family="sans-serif" font-size="28" fill="${COLORS.text}">${esc(text)}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

module.exports = { parseGraphRequest, buildGraphSvg };
