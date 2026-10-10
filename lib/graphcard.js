// Draws a Desmos-style graph image (as SVG, which the !desmos command turns
// into a PNG with resvg — the same way the weather and profile cards work).
//
// It understands:
//   • y = f(x)                      e.g.  x^2,  y=sin(x),  2x+1
//   • restricted lines / curves     e.g.  x=733\left\{6\le y\le 8\right\}
//                                         y=109\left\{687\le x\le 688\right\}
//   • parametric points (t: 0→1)    e.g.  \left((1-t)^{3}\cdot 5+..., ...\right)
//   • equations in x and y          e.g.  x^2+y^2=25,  y^2=x,  x*y=1
//   • values you define             e.g.  a=2   (then use a in the other lines)
// including the LaTeX that Desmos copies out (\left \right \le \cdot ^{ } \frac{ }{ } ...).
//
// Nothing here uses eval(): the math is parsed by a small hand-written parser
// and only ever calls the whitelisted functions below, so a chat message can
// never run code on the bot.

const MAX_ITEMS = 20000;
const MAX_INPUT_LENGTH = 8000000;
const MAX_ITEM_LENGTH = 3000;
const MAX_LEGEND_ITEMS = 6;

const IMAGE_WIDTH = 2560; // the picture is always 2560 x 1440 pixels
const IMAGE_HEIGHT = 1440;

const SAMPLES = 2000; // samples for an open-ended y = f(x)
const BOUNDED_SAMPLES = 200; // samples for a curve with its own range
const PARAM_SAMPLES = 80; // samples for a parametric curve (t from 0 to 1)

const LEGEND_ROW = 46;
const IMPLICIT_GRID = 400; // cells across for x^2+y^2=25 style equations

// Values defined with lines like "a=2" for the request being parsed right now.
let activeConsts = {};

const COLORS = {
  bg: "#ffffff",
  minor: "#ececec",
  major: "#d4d4d4",
  axis: "#444444",
  label: "#555555",
  border: "#bdbdbd",
  text: "#222222",
};

// The same colours Desmos uses for its first six curves.
const CURVE_COLORS = ["#c74440", "#2d70b3", "#388c46", "#6042a6", "#fa7e19", "#000000"];
const MANY_COLOR = "#c74440"; // Desmos red, used when there are too many items for the 6 colours

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

/**
 * Turns the LaTeX Desmos copies out into the plain text the parser reads.
 * Restriction braces \left\{ ... \right\} become « ... ».
 */
function latexToPlain(input) {
  let s = String(input)
    .replace(/\r/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\\{/g, "«")
    .replace(/\\\}/g, "»")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/\\leq?(?![a-zA-Z])/g, "<=")
    .replace(/\\geq?(?![a-zA-Z])/g, ">=")
    .replace(/\\(?:cdot|times)(?![a-zA-Z])/g, "*")
    .replace(/\\div(?![a-zA-Z])/g, "/")
    .replace(/\\pi(?![a-zA-Z])/g, "pi");

  // Innermost-first so nested braces like \frac{1}{\sqrt{2}} work.
  for (let i = 0; i < 20; i++) {
    const before = s;
    s = s
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "(($1)/($2))")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)")
      .replace(/\^\s*\{([^{}]*)\}/g, "^($1)")
      .replace(/_\s*\{[^{}]*\}/g, "");
    if (s === before) break;
  }

  return s
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\([a-zA-Z]+)/g, "$1") // \sin -> sin, \ln -> ln, ...
    .replace(/\{([^{}]*[<>][^{}]*)\}/g, "«$1»") // plain {6<=y<=8} restrictions
    .replace(/\{/g, "(")
    .replace(/\}/g, ")");
}

function tokenize(src, varName) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(src.slice(i));
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
 * Turns an expression (like "2x^2 - 3sin(x)") into a JS function of one
 * variable. `varName` is the letter that stands for the input ("x", "y" or
 * "t"), or null if no variable is allowed. Throws an Error with a
 * user-friendly message if it can't be read.
 */
function compileExpression(source, varName = "x", opts = {}) {
  const consts = opts.consts || activeConsts;
  const yCell = { v: 0 };
  const tokens = tokenize(normalise(source), varName);
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
      if (varName && tok.value === varName) return (x) => x;
      if (opts.extraVar && tok.value === opts.extraVar) return () => yCell.v;
      if (Object.prototype.hasOwnProperty.call(consts, tok.value)) {
        const v = consts[tok.value];
        return () => v;
      }
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
      throw new Error(
        varName
          ? `I don't know "${tok.value}" — only ${opts.extraVar ? `${varName} and ${opts.extraVar} are` : `${varName} is`} allowed as a variable here (define others like a=2).`
          : `I don't know "${tok.value}" — this needs to be a plain number.`
      );
    }

    throw new Error(`Unexpected "${tok.value}".`);
  }

  const fn = parseExpr();
  if (pos < tokens.length) {
    const left = tokens[pos];
    throw new Error(left.value === ")" ? 'There\'s a stray ")".' : `Unexpected "${left.value}".`);
  }
  fn.setY = (v) => {
    yCell.v = v;
  };
  return fn;
}

// ------------------------------------------------------------- request

/** Cuts text into pieces of roughly `size` characters, only ever at a line break. */
function* chunkLines(text, size) {
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const nl = text.indexOf("\n", end);
      end = nl === -1 ? text.length : nl;
    }
    yield text.slice(start, end);
    start = end;
  }
}

function parseWindow(text) {
  // "x:-5..5" and "y:-2..2" set the visible window.
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
 * Splits the message into separate items. Items end at a new line, at ; or ,
 * (outside brackets), after a restriction « ... », and after a "(a, b)" point —
 * so it still works if the chat app squashed the new lines into spaces.
 */
function splitItems(text) {
  const items = [];
  let cur = "";
  let paren = 0;
  let brace = 0;
  let startsWithParen = false;
  let pointComma = false;
  let blank = true; // nothing but spaces in the current item so far

  const flush = () => {
    if (cur.trim()) items.push(cur.trim());
    cur = "";
    startsWithParen = false;
    pointComma = false;
    blank = true;
  };

  for (const ch of text) {
    if (paren === 0 && brace === 0 && (ch === "\n" || ch === ";" || ch === ",")) {
      flush();
      continue;
    }
    if (blank && ch === "(") startsWithParen = true;
    if (blank && ch.trim() !== "") blank = false;
    cur += ch;

    if (ch === "(") {
      paren++;
    } else if (ch === ")") {
      paren = Math.max(0, paren - 1);
      if (paren === 0 && brace === 0 && startsWithParen && pointComma) flush();
    } else if (ch === "«") {
      brace++;
    } else if (ch === "»") {
      brace = Math.max(0, brace - 1);
      if (brace === 0 && paren === 0) flush();
    } else if (ch === "," && paren === 1) {
      pointComma = true;
    }
  }
  flush();
  return items;
}

/** Index of the comma that separates the two halves of "a, b" (outside any brackets), or -1. */
function topLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

function constantValue(text) {
  const v = compileExpression(text, null)(0);
  if (!Number.isFinite(v)) throw new Error("A range limit isn't a valid number.");
  return v;
}

/** Reads the inside of « ... » like "6<=y<=8" or "x>=2" into { lo, hi } for the given variable. */
function parseRestriction(body, varName) {
  const parts = body.split(/(<=|>=|<|>)/).map((s) => s.trim());
  const bad = () => new Error(`I couldn't read the range "${body.trim()}" — use something like 6<=${varName}<=8.`);
  const lessThan = (op) => op === "<" || op === "<=";
  let lo = -Infinity;
  let hi = Infinity;

  if (parts.length === 5 && parts[2] === varName) {
    const [a, op1, , op2, c] = [parts[0], parts[1], parts[2], parts[3], parts[4]];
    if (lessThan(op1) && lessThan(op2)) {
      lo = constantValue(a);
      hi = constantValue(c);
    } else if (!lessThan(op1) && !lessThan(op2)) {
      hi = constantValue(a);
      lo = constantValue(c);
    } else {
      throw bad();
    }
  } else if (parts.length === 3 && parts[0] === varName) {
    const v = constantValue(parts[2]);
    if (lessThan(parts[1])) hi = v;
    else lo = v;
  } else if (parts.length === 3 && parts[2] === varName) {
    const v = constantValue(parts[0]);
    if (lessThan(parts[1])) lo = v;
    else hi = v;
  } else {
    throw bad();
  }

  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

function shorten(text, max = 58) {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Finishes a line that was cut off by the chat app (brackets never closed).
 * For a Bezier point it adds the missing terms, repeating the last number it
 * saw, so the curve can still be drawn; otherwise it just closes the brackets.
 */
function repairCutOff(raw) {
  let text = raw.replace(/[\s+\-*\/^(.,]+$/, ""); // drop a dangling operator / half-typed bit

  let depth = 0;
  let lastComma = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 1) lastComma = i;
  }

  if (lastComma !== -1) {
    const comp = text.slice(lastComma + 1);
    const compact = comp.replace(/\s/g, "");
    const last = /(\d+(?:\.\d+)?)\s*$/.exec(comp);
    if (last && /\(1-t\)\^\(3\)/.test(compact)) {
      const L = last[1];
      if (!/3\(1-t\)\^\(2\)t/.test(compact)) text += `+3(1-t)^(2)t*${L}`;
      if (!/3\(1-t\)t\^\(2\)/.test(compact)) text += `+3(1-t)t^(2)*${L}`;
      if (!/\+t\^\(3\)/.test(compact)) text += `+t^(3)*${L}`;
    }
  }

  return text + ")".repeat(Math.max(0, depth));
}

/** Reads one item into { kind: "fn" | "xfn" | "param" | "implicit", ... } or throws a friendly Error. */
function parseItem(raw) {
  // A line whose brackets never close usually means the message was cut off (chat apps limit length).
  const opened = (raw.match(/\(/g) || []).length;
  const closed = (raw.match(/\)/g) || []).length;
  if (opened > closed) {
    try {
      const item = parseItemInner(repairCutOff(raw));
      item.cutOff = true;
      return item;
    } catch (err) {
      throw new Error(`it looks cut off and I couldn't finish it (${err.message})`);
    }
  }
  return parseItemInner(raw);
}

function parseItemInner(raw) {
  if (raw.length > MAX_ITEM_LENGTH) throw new Error("One of those expressions is too long.");

  // (fx(t), fy(t))  — a point that moves as t goes from 0 to 1
  if (raw.startsWith("(") && raw.endsWith(")")) {
    const inner = raw.slice(1, -1);
    const comma = topLevelComma(inner);
    if (comma !== -1) {
      const fxSrc = inner.slice(0, comma);
      const fySrc = inner.slice(comma + 1);
      return {
        kind: "param",
        fx: compileExpression(fxSrc, "t"),
        fy: compileExpression(fySrc, "t"),
        label: `(${shorten(fxSrc.trim(), 28)}, ${shorten(fySrc.trim(), 28)})`,
      };
    }
  }

  let main = raw;
  let restriction = null;
  const open = raw.indexOf("«");
  if (open !== -1) {
    const close = raw.indexOf("»", open);
    if (close === -1) throw new Error('A range "{" is never closed.');
    main = raw.slice(0, open);
    restriction = raw.slice(open + 1, close);
  }

  const body = normalise(main).trim();
  if (!body) throw new Error("That expression is empty.");

  let kind = "fn";
  let exprSrc = body;
  if (/^y\s*=/.test(body)) {
    exprSrc = body.replace(/^y\s*=\s*/, "");
  } else if (/^x\s*=/.test(body)) {
    kind = "xfn";
    exprSrc = body.replace(/^x\s*=\s*/, "");
  } else if (body.includes("=")) {
    // Anything else with an "=" sign, like x^2+y^2=25, is drawn as the curve where both sides match.
    const sides = body.split("=");
    if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) {
      throw new Error('Use exactly one "=" sign, like x^2+y^2=25.');
    }
    return {
      kind: "implicit",
      fn: compileExpression(`(${sides[0]})-(${sides[1]})`, "x", { extraVar: "y" }),
      lo: -Infinity,
      hi: Infinity,
      label: shorten(body, 50),
    };
  }

  // y = f(x) is restricted by x; x = f(y) is restricted by y.
  const varName = kind === "fn" ? "x" : "y";
  const range = restriction ? parseRestriction(normalise(restriction), varName) : { lo: -Infinity, hi: Infinity };

  return {
    kind,
    fn: compileExpression(exprSrc, varName),
    lo: range.lo,
    hi: range.hi,
    label: `${kind === "fn" ? "y" : "x"} = ${shorten(exprSrc.trim(), 40)}`,
  };
}

/**
 * Reads the text after "!desmos". Returns { items, window } or throws an
 * Error with a message that is safe to show to the user.
 */
function parseGraphRequest(input) {
  const text = String(input || "");
  if (text.length > MAX_INPUT_LENGTH) throw new Error("That's too much to graph at once.");

  const { win, rest } = parseWindow(text);

  for (const key of ["x", "y"]) {
    if (win[key] && win[key][0] === win[key][1]) {
      throw new Error(`The ${key} range needs two different numbers, like ${key}:-5..5`);
    }
  }

  // Very long input is converted in chunks of whole lines (keeps memory use low); identical lines are only drawn once.
  const seen = new Set();
  const pieces = [];
  for (const chunk of chunkLines(rest, 300000)) {
    for (const piece of splitItems(latexToPlain(chunk))) {
      if (seen.has(piece)) continue;
      seen.add(piece);
      pieces.push(piece);
    }
  }
  if (pieces.length === 0) throw new Error("Give me something to graph.");
  if (pieces.length > MAX_ITEMS) throw new Error(`That's too many — I can graph up to ${MAX_ITEMS} things at once.`);

  activeConsts = {};
  try {
    // Lines like "a=2" define a value that every other line can use.
    const drawable = [];
    pieces.forEach((piece, index) => {
      const m = /^([a-df-su-wz])\s*=\s*([^=«»]+)$/.exec(normalise(piece).trim());
      if (!m) {
        drawable.push({ piece, index });
        return;
      }
      try {
        const value = compileExpression(m[2], null)(0);
        if (!Number.isFinite(value)) throw new Error("that isn't a valid number.");
        activeConsts[m[1]] = value;
      } catch (err) {
        throw new Error(`Item ${index + 1} ("${shorten(piece, 40)}") — ${err.message}`);
      }
    });

    if (drawable.length === 0) {
      throw new Error("Those only define values — add something to graph in the same message, like: a=2; y=a*x");
    }

    // A line that can't be read is skipped (and reported) instead of ruining the whole graph.
    const items = [];
    const skipped = [];
    const repaired = [];
    for (const { piece, index } of drawable) {
      try {
        const item = parseItem(piece);
        presample(item);
        if (item.cutOff) repaired.push(index + 1);
        items.push(item);
      } catch (err) {
        skipped.push(`Item ${index + 1} ("${shorten(piece, 40)}") — ${err.message}`);
      }
    }
    if (items.length === 0) throw new Error(skipped[0]);

    return { items, window: win, skipped, repaired };
  } finally {
    activeConsts = {};
  }
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

function safe(fn, v) {
  try {
    const out = fn(v);
    return Number.isFinite(out) ? out : NaN;
  } catch {
    return NaN;
  }
}

function isBounded(item) {
  if (item.kind === "param") return true;
  return Number.isFinite(item.lo) && Number.isFinite(item.hi);
}

// Sampled curves are stored as flat Float64Arrays [x0, y0, x1, y1, ...] (much lighter than objects,
// which matters when a drawing has thousands of lines).

/** Points of a y = f(x) curve over [lo, hi]. */
function sampleFn(item, lo, hi, n) {
  if (!(hi >= lo)) return new Float64Array(0);
  const out = new Float64Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    out[2 * i] = x;
    out[2 * i + 1] = safe(item.fn, x);
  }
  return out;
}

/** Points of an x = f(y) curve over y in [lo, hi]. */
function sampleXfn(item, lo, hi, n) {
  if (!(hi >= lo)) return new Float64Array(0);
  const out = new Float64Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) {
    const y = lo + ((hi - lo) * i) / n;
    out[2 * i] = safe(item.fn, y);
    out[2 * i + 1] = y;
  }
  return out;
}

/** Line segments tracing f(x, y) = 0 inside the window (marching squares). */
function sampleImplicit(item, xMin, xMax, yMin, yMax) {
  const n = IMPLICIT_GRID;
  const cols = n + 1;
  const vals = new Float64Array(cols * cols);
  for (let j = 0; j <= n; j++) {
    const y = yMin + ((yMax - yMin) * j) / n;
    item.fn.setY(y);
    for (let i = 0; i <= n; i++) {
      vals[j * cols + i] = safe(item.fn, xMin + ((xMax - xMin) * i) / n);
    }
  }

  const segments = [];
  const LIMIT = 1e9;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = vals[j * cols + i]; // bottom-left
      const b = vals[j * cols + i + 1]; // bottom-right
      const c = vals[(j + 1) * cols + i + 1]; // top-right
      const d = vals[(j + 1) * cols + i]; // top-left
      if (Number.isNaN(a + b + c + d)) continue;
      if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) > LIMIT) continue;
      if ((a > 0) === (b > 0) && (b > 0) === (c > 0) && (c > 0) === (d > 0)) continue;

      const x0 = xMin + ((xMax - xMin) * i) / n;
      const x1 = xMin + ((xMax - xMin) * (i + 1)) / n;
      const y0 = yMin + ((yMax - yMin) * j) / n;
      const y1 = yMin + ((yMax - yMin) * (j + 1)) / n;
      const mix = (p, q, from, to) => from + ((to - from) * p) / (p - q);

      const B = (a > 0) !== (b > 0) ? [mix(a, b, x0, x1), y0] : null;
      const R = (b > 0) !== (c > 0) ? [x1, mix(b, c, y0, y1)] : null;
      const T = (d > 0) !== (c > 0) ? [mix(d, c, x0, x1), y1] : null;
      const L = (a > 0) !== (d > 0) ? [x0, mix(a, d, y0, y1)] : null;
      const found = [B, R, T, L].filter(Boolean);

      if (found.length === 2) {
        segments.push([found[0], found[1]]);
      } else if (found.length === 4) {
        const centreSameAsA = (a + b + c + d) / 4 > 0 === a > 0;
        if (centreSameAsA) segments.push([B, R], [T, L]);
        else segments.push([L, B], [R, T]);
      }
    }
  }
  return segments;
}

/** Points of a parametric curve for t from 0 to 1. */
function sampleParam(item) {
  const out = new Float64Array((PARAM_SAMPLES + 1) * 2);
  for (let i = 0; i <= PARAM_SAMPLES; i++) {
    const t = i / PARAM_SAMPLES;
    out[2 * i] = safe(item.fx, t);
    out[2 * i + 1] = safe(item.fy, t);
  }
  return out;
}

/** Straight lines only need their two ends; anything curved gets the full sampling. */
function sampleBounded(item) {
  const sample = item.kind === "fn" ? sampleFn : sampleXfn;
  const probe = sample(item, item.lo, item.hi, 16);
  const n = probe.length / 2;
  const x0 = probe[0];
  const y0 = probe[1];
  const dx = probe[2 * (n - 1)] - x0;
  const dy = probe[2 * (n - 1) + 1] - y0;
  const len = Math.hypot(dx, dy);
  let straight = Number.isFinite(len) && len > 0;
  for (let i = 1; straight && i < n - 1; i++) {
    const px0 = probe[2 * i] - x0;
    const py0 = probe[2 * i + 1] - y0;
    if (!Number.isFinite(px0 + py0) || Math.abs(px0 * dy - py0 * dx) / len > 1e-9 * (1 + len)) straight = false;
  }
  if (straight) return new Float64Array([x0, y0, probe[2 * (n - 1)], probe[2 * (n - 1) + 1]]);
  return sample(item, item.lo, item.hi, BOUNDED_SAMPLES);
}

/**
 * Items with their own range (segments, parametric curves) are sampled right away and their
 * formulas dropped, so thousands of them don't keep thousands of compiled formulas in memory.
 */
function presample(item) {
  if (item.kind === "param") {
    item.samples = sampleParam(item);
    item.fx = null;
    item.fy = null;
  } else if (item.kind !== "implicit" && Number.isFinite(item.lo) && Number.isFinite(item.hi)) {
    item.samples = sampleBounded(item);
    item.fn = null;
  }
}

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/** Picks a y range that shows the interesting part of the curves when the user didn't give one. */
function autoYRange(arrays) {
  const ys = [];
  for (const arr of arrays) {
    for (let i = 1; i < arr.length; i += 2) {
      if (Number.isFinite(arr[i]) && Math.abs(arr[i]) < 1e9) ys.push(arr[i]);
    }
  }
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

/** Bounding box of every finite point, with a little breathing room. */
function fitBounds(arrays) {
  let xLo = Infinity;
  let xHi = -Infinity;
  let yLo = Infinity;
  let yHi = -Infinity;
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i += 2) {
      const x = arr[i];
      const y = arr[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xLo) xLo = x;
      if (x > xHi) xHi = x;
      if (y < yLo) yLo = y;
      if (y > yHi) yHi = y;
    }
  }
  if (!Number.isFinite(xLo)) return { x: [-10, 10], y: [-10, 10] };
  if (xHi - xLo < 1e-9) {
    xLo -= 1;
    xHi += 1;
  }
  if (yHi - yLo < 1e-9) {
    yLo -= 1;
    yHi += 1;
  }
  const padX = (xHi - xLo) * 0.03;
  const padY = (yHi - yLo) * 0.03;
  return { x: [xLo - padX, xHi + padX], y: [yLo - padY, yHi + padY] };
}

/** Drops points that sit on a straight line between their neighbours (keeps the SVG small). */
function simplify(run) {
  if (run.length < 3) return run;
  const out = [run[0]];
  for (let i = 1; i < run.length - 1; i++) {
    const a = out[out.length - 1];
    const b = run[i];
    const c = run[i + 1];
    const len = Math.hypot(c.sx - a.sx, c.sy - a.sy);
    const dist = len < 1e-9 ? Math.hypot(b.sx - a.sx, b.sy - a.sy) : Math.abs((c.sx - a.sx) * (a.sy - b.sy) - (a.sx - b.sx) * (c.sy - a.sy)) / len;
    if (dist > 0.1) out.push(b);
  }
  out.push(run[run.length - 1]);
  return out;
}

/**
 * Adjusts a window so one unit is the same length on both axes (like Desmos)
 * for an image of the given width/height ratio. Axes the user fixed are left alone.
 */
function matchRatio(xr, yr, ratio, lockX, lockY, mayShrinkX) {
  let [x0, x1] = xr;
  let [y0, y1] = yr;
  const xs = x1 - x0;
  const ys = y1 - y0;
  const widen = () => {
    const w = ys * ratio;
    const c = (x0 + x1) / 2;
    return [c - w / 2, c + w / 2];
  };
  if (xs / ys < ratio) {
    if (!lockX) [x0, x1] = widen();
  } else if (xs / ys > ratio) {
    if (!lockY) {
      const h = xs / ratio;
      const c = (y0 + y1) / 2;
      [y0, y1] = [c - h / 2, c + h / 2];
    } else if (!lockX && mayShrinkX) {
      [x0, x1] = widen();
    }
  }
  return [[x0, x1], [y0, y1]];
}

function buildGraphSvg({ items, window: win = {} }) {
  const hasX = !!win.x;
  const hasY = !!win.y;

  // 1. Things with their own range (segments, parametric curves) tell us where to look.
  const samples = new Map();
  const bounded = items.filter(isBounded);
  const geometryMode = bounded.length > 0;
  for (const item of bounded) {
    if (!item.samples) presample(item);
    samples.set(item, item.samples);
  }

  let xRange = win.x || null;
  let yRange = win.y || null;
  if (geometryMode) {
    const fit = fitBounds([...samples.values()]);
    xRange = xRange || fit.x;
    yRange = yRange || fit.y;
    [xRange, yRange] = matchRatio(xRange, yRange, IMAGE_WIDTH / IMAGE_HEIGHT, hasX, hasY, false);
  } else {
    xRange = xRange || [-10, 10];
    if (!hasX && !hasY) yRange = [-10, 10];
    if (yRange) [xRange, yRange] = matchRatio(xRange, yRange, IMAGE_WIDTH / IMAGE_HEIGHT, hasX, true, true);
  }
  const [xMin, xMax] = xRange;

  // 2. Open-ended y = f(x) curves are drawn across the whole window.
  for (const item of items) {
    if (isBounded(item) || item.kind !== "fn") continue;
    samples.set(item, sampleFn(item, Math.max(item.lo, xMin), Math.min(item.hi, xMax), SAMPLES));
  }
  if (!yRange) {
    const fnPoints = items.filter((i) => i.kind === "fn" && !isBounded(i)).map((i) => samples.get(i));
    yRange = hasX ? autoYRange(fnPoints) : [-10, 10];
  }
  const [yMin, yMax] = yRange;

  // Equations like x^2+y^2=25 are traced across the whole window.
  for (const item of items) {
    if (item.kind === "implicit") samples.set(item, sampleImplicit(item, xMin, xMax, yMin, yMax));
  }

  // 3. Open-ended x = f(y) lines are drawn across the window's full height.
  for (const item of items) {
    if (isBounded(item) || item.kind !== "xfn") continue;
    samples.set(item, sampleXfn(item, Math.max(item.lo, yMin), Math.min(item.hi, yMax), BOUNDED_SAMPLES));
  }

  // Fixed canvas: 2560 x 1440. The legend (if any) sits on top of the graph, bottom-left.
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  const k = W / 1000; // scales line widths and text with the image

  const showLegend = items.length <= MAX_LEGEND_ITEMS;
  const totalH = H;

  const px = (x) => ((x - xMin) / (xMax - xMin)) * W;
  const py = (y) => H - ((y - yMin) / (yMax - yMin)) * H;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">`;
  svg += `<defs><clipPath id="plot"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`;
  svg += `<rect width="${W}" height="${totalH}" fill="${COLORS.bg}"/>`;

  // Grid
  const gx = niceStep(xMax - xMin);
  const gy = niceStep(yMax - yMin);
  const lines = (min, max, step, vertical, color, width) => {
    let out = "";
    const first = Math.ceil(min / step - 1e-9);
    const last = Math.floor(max / step + 1e-9);
    if (last - first > 600) return out; // absurdly dense grid — skip
    for (let n = first; n <= last; n++) {
      const v = n * step;
      if (vertical) {
        const x = round1(px(v));
        out += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${color}" stroke-width="${width}"/>`;
      } else {
        const y = round1(py(v));
        out += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`;
      }
    }
    return out;
  };
  svg += lines(xMin, xMax, gx.minor, true, COLORS.minor, 1);
  svg += lines(yMin, yMax, gy.minor, false, COLORS.minor, 1);
  svg += lines(xMin, xMax, gx.step, true, COLORS.major, 1.5);
  svg += lines(yMin, yMax, gy.step, false, COLORS.major, 1.5);

  // Axes
  const axisX = Math.min(H, Math.max(0, py(0))); // where the x-axis sits (clamped to the edge)
  const axisY = Math.min(W, Math.max(0, px(0)));
  if (yMin <= 0 && yMax >= 0) svg += `<line x1="0" y1="${round1(axisX)}" x2="${W}" y2="${round1(axisX)}" stroke="${COLORS.axis}" stroke-width="${2.5 * k}"/>`;
  if (xMin <= 0 && xMax >= 0) svg += `<line x1="${round1(axisY)}" y1="0" x2="${round1(axisY)}" y2="${H}" stroke="${COLORS.axis}" stroke-width="${2.5 * k}"/>`;

  // Axis numbers (with a white halo so they stay readable on top of curves)
  const fontSize = 20 * k;
  const label = (x, y, text, anchor) => {
    const attrs = `x="${round1(x)}" y="${round1(y)}" text-anchor="${anchor}" font-family="sans-serif" font-size="${fontSize}"`;
    return (
      `<text ${attrs} fill="none" stroke="${COLORS.bg}" stroke-width="${5 * k}" stroke-linejoin="round">${esc(text)}</text>` +
      `<text ${attrs} fill="${COLORS.label}">${esc(text)}</text>`
    );
  };
  const firstX = Math.ceil(xMin / gx.step - 1e-9);
  const lastX = Math.floor(xMax / gx.step + 1e-9);
  let lastLabelX = -Infinity;
  for (let n = firstX; n <= lastX; n++) {
    if (n === 0) continue;
    const x = px(n * gx.step);
    if (x < 24 * k || x > W - 24 * k) continue;
    if (x - lastLabelX < fontSize * 3.2) continue; // keep numbers from overlapping
    lastLabelX = x;
    const y = Math.min(H - 8 * k, axisX + 24 * k);
    svg += label(x, y, fmt(n * gx.step), "middle");
  }
  const firstY = Math.ceil(yMin / gy.step - 1e-9);
  const lastY = Math.floor(yMax / gy.step + 1e-9);
  let lastLabelY = Infinity;
  for (let n = firstY; n <= lastY; n++) {
    if (n === 0) continue;
    const y = py(n * gy.step);
    if (y < 20 * k || y > H - 20 * k) continue;
    if (lastLabelY - y < fontSize * 1.8) continue; // keep numbers from overlapping
    lastLabelY = y;
    const onRight = axisY > W - 70 * k;
    const x = onRight ? axisY - 8 * k : Math.max(8 * k, axisY + 8 * k);
    svg += label(x, y + 7 * k, fmt(n * gy.step), onRight ? "end" : "start");
  }
  if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
    svg += label(axisY - 8 * k, axisX + 24 * k, "0", "end");
  }

  // Curves
  const strokeWidth = showLegend ? 4.5 * k : 2 * k;
  svg += `<g clip-path="url(#plot)" fill="none" stroke-linejoin="round" stroke-linecap="round">`;
  items.forEach((item, index) => {
    const color = showLegend ? CURVE_COLORS[index % CURVE_COLORS.length] : MANY_COLOR;
    if (item.kind === "implicit") {
      const d = (samples.get(item) || [])
        .map(([p, q]) => `M${round1(px(p[0]))} ${round1(py(p[1]))}L${round1(px(q[0]))} ${round1(py(q[1]))}`)
        .join("");
      if (d) svg += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
      return;
    }
    const CLAMP = 1e5;
    const runs = [];
    let run = [];
    let prev = null;

    const arr = samples.get(item) || new Float64Array(0);
    for (let i = 0; i < arr.length; i += 2) {
      const ax = arr[i];
      const ay = arr[i + 1];
      if (!Number.isFinite(ax) || !Number.isFinite(ay)) {
        if (run.length) runs.push(run);
        run = [];
        prev = null;
        continue;
      }
      const sx = Math.max(-CLAMP, Math.min(CLAMP, px(ax)));
      const sy = Math.max(-CLAMP, Math.min(CLAMP, py(ay)));

      // Break the line across an asymptote (jumping from far above the window to far below it).
      const jumps = prev && ((prev.sy < 0 && sy > H) || (prev.sy > H && sy < 0));
      if (jumps) {
        runs.push(run);
        run = [];
      }
      run.push({ sx, sy });
      prev = { sy };
    }
    if (run.length) runs.push(run);

    let d = "";
    for (const r of runs) {
      const pts = simplify(r);
      if (pts.length === 1) pts.push(pts[0]); // a single point still shows as a dot
      d += pts.map((p, i) => `${i === 0 ? "M" : "L"}${round1(p.sx)} ${round1(p.sy)}`).join("");
    }
    if (d) svg += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
  });
  svg += `</g>`;

  // Frame
  svg += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${COLORS.border}" stroke-width="2"/>`;

  // Legend (only when there are a few items), drawn over the bottom-left of the graph
  if (showLegend) {
    const kl = k * 0.65;
    const row = LEGEND_ROW * kl;
    const fontPx = 28 * kl;
    const labels = items.map((item) => shorten(item.label));
    const longest = Math.max(...labels.map((l) => l.length));
    const boxW = 110 * kl + longest * fontPx * 0.56 + 30 * kl;
    const boxH = items.length * row + 24 * kl;
    const boxX = 24 * k;
    const boxY = H - boxH - 24 * k;
    svg += `<rect x="${round1(boxX)}" y="${round1(boxY)}" width="${round1(boxW)}" height="${round1(boxH)}" rx="${10 * k}" fill="#ffffff" fill-opacity="0.9" stroke="${COLORS.border}" stroke-width="2"/>`;
    items.forEach((item, index) => {
      const color = CURVE_COLORS[index % CURVE_COLORS.length];
      const cy = boxY + 12 * kl + index * row + row / 2;
      svg += `<line x1="${round1(boxX + 20 * kl)}" y1="${round1(cy)}" x2="${round1(boxX + 70 * kl)}" y2="${round1(cy)}" stroke="${color}" stroke-width="${6 * kl}" stroke-linecap="round"/>`;
      svg += `<text x="${round1(boxX + 90 * kl)}" y="${round1(cy + fontPx * 0.32)}" font-family="sans-serif" font-size="${round1(fontPx)}" fill="${COLORS.text}">${esc(labels[index])}</text>`;
    });
  }

  svg += `</svg>`;
  return svg;
}

module.exports = { parseGraphRequest, buildGraphSvg };
