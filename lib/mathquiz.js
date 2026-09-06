// One active round per chat at a time, keyed by whatever chatId the
// calling platform passes in.
const games = new Map(); // chatId -> game state

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

/** Starts a new round. `sendText` is a (text) => Promise scoped to this
 * chat already, used for the timeout message. Returns { error } or
 * { started, question }. */
function startGame(chatId, sendText) {
  if (games.has(chatId)) {
    return { error: "A math quiz is already in progress. Type *!math stop* to end it first." };
  }

  const { question, answer } = makeProblem();
  const timer = setTimeout(() => {
    if (games.has(chatId)) {
      games.delete(chatId);
      sendText(`⏰ Time's up! The answer was *${answer}*.`);
    }
  }, ROUND_TIMEOUT_MS);

  games.set(chatId, { question, answer, timer });
  return { started: true, question };
}

/** Ends whatever round is running in this chat, if any. */
function stopGame(chatId) {
  const game = games.get(chatId);
  if (!game) return false;
  clearTimeout(game.timer);
  games.delete(chatId);
  return true;
}

/**
 * Handles a plain (non-prefixed) message that might be an answer to an
 * in-progress round in this chat. Returns true if it consumed the
 * message. `sendText` is (text) => Promise, scoped to this chat.
 */
async function handleMathAnswer({ chatId, text, sendText }) {
  const game = games.get(chatId);
  if (!game) return false;

  const guess = text.trim();
  if (!/^-?\d+$/.test(guess)) return false;

  if (parseInt(guess, 10) === game.answer) {
    clearTimeout(game.timer);
    games.delete(chatId);
    await sendText(`🎉 Correct! ${game.question} = ${game.answer}`);
    return true;
  }

  return false; // wrong answers get ignored, not called out
}

module.exports = { startGame, stopGame, handleMathAnswer };
