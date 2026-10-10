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

const MAX_ITEMS = 800;
const MAX_INPUT_LENGTH = 150000;
const MAX_ITEM_LENGTH = 3000;
const MAX_LEGEND_ITEMS = 6;

const SAMPLES = 1200; // samples for an open-ended y = f(x)
const BOUNDED_SAMPLES = 200; // samples for a curve with its own range
const PARAM_SAMPLES = 80; // samples for a parametric curve (t from 0 to 1)

const LEGEND_ROW = 46;
const IMPLICIT_GRID = 240; // cells across for x^2+y^2=25 style equations

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
const MANY_COLOR = "#2d70b3"; // used when there are too many items for the 6 colours

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

  const flush = () => {
    if (cur.trim()) items.push(cur.trim());
    cur = "";
    startsWithParen = false;
    pointComma = false;
  };

  for (const ch of text) {
    if (paren === 0 && brace === 0 && (ch === "\n" || ch === ";" || ch === ",")) {
      flush();
      continue;
    }
    if (cur.trim() === "" && ch === "(") startsWithParen = true;
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

/** Reads one item into { kind: "fn" | "xfn" | "param", ... } or throws a friendly Error. */
function parseItem(raw) {
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

  const pieces = [...new Set(splitItems(latexToPlain(rest)))]; // identical lines are only drawn once
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

    const items = drawable.map(({ piece, index }) => {
      try {
        return parseItem(piece);
      } catch (err) {
        throw new Error(`Item ${index + 1} ("${shorten(piece, 40)}") — ${err.message}`);
      }
    });

    return { items, window: win };
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

/** Points of a y = f(x) curve over [lo, hi]. */
function sampleFn(item, lo, hi, n) {
  const points = [];
  if (!(hi >= lo)) return points;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    points.push({ x, y: safe(item.fn, x) });
  }
  return points;
}

/** Points of an x = f(y) curve over y in [lo, hi]. */
function sampleXfn(item, lo, hi, n) {
  const points = [];
  if (!(hi >= lo)) return points;
  for (let i = 0; i <= n; i++) {
    const y = lo + ((hi - lo) * i) / n;
    points.push({ x: safe(item.fn, y), y });
  }
  return points;
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
      const y0 = yMin
