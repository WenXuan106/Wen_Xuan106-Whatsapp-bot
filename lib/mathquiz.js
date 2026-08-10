// One active round per group at a time, keyed by group jid.
const games = new Map(); // jid -> game state

const ROUND_TIMEOUT_MS = 30000;

const OPS = [
  { symbol: "+", apply: (a, b) => a + b },
  { symbol: "-", apply: (a, b) => a - b },
  { symbol: "×", apply: (a, b) => a * b },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeProblem() {
  const op = OPS[Math.floor(Math.random() * OPS.length)];
  // Keep multiplication operands small so the mental math stays quick.
  const [min, max] = op.symbol === "×" ? [2, 12] : [1, 50];
  const a = randInt(min, max);
  const b = randInt(min, max);
  return { question: `${a} ${op.symbol} ${b}`, answer: op.apply(a, b) };
}

/** Starts a new round. Returns { error } or { started, question }. */
function startGame(jid, onTimeout) {
  if (games.has(jid)) {
    return { error: "A math quiz is already in progress. Type *!math stop* to end it first." };
  }

  const { question, answer } = makeProblem();
  const timer = setTimeout(() => {
    if (games.has(jid)) {
      games.delete(jid);
      onTimeout(jid, `⏰ Time's up! The answer was *${answer}*.`);
    }
  }, ROUND_TIMEOUT_MS);

  games.set(jid, { question, answer, timer });
  return { started: true, question };
}

/** Ends whatever round is running in this group, if any. */
function stopGame(jid) {
  const game = games.get(jid);
  if (!game) return false;
  clearTimeout(game.timer);
  games.delete(jid);
  return true;
}

/**
 * Handles a plain (non-prefixed) message that might be an answer to an
 * in-progress round in this group. Returns true if it consumed the message.
 */
async function handleMathAnswer({ sock, jid, text }) {
  const game = games.get(jid);
  if (!game) return false;

  const guess = text.trim();
  if (!/^-?\d+$/.test(guess)) return false;

  if (parseInt(guess, 10) === game.answer) {
    clearTimeout(game.timer);
    games.delete(jid);
    await sock.sendMessage(jid, { text: `🎉 Correct! ${game.question} = ${game.answer}` });
    return true;
  }

  return false; // wrong answers get ignored, not called out
}

module.exports = { startGame, stopGame, handleMathAnswer };
