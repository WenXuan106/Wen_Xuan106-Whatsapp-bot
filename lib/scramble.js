// One active round per group at a time, keyed by group jid. Same approach
// as lib/hangman.js and lib/tictactoe.js.
const games = new Map(); // jid -> game state

const WORDS = [
  "javascript", "baileys", "whatsapp", "keyboard", "internet",
  "function", "variable", "database", "computer", "elephant",
  "mountain", "sandwich", "umbrella", "notebook", "triangle",
  "birthday", "calendar", "language", "sunshine", "dinosaur",
];

const HINT_REVEAL_AFTER_MS = 20000; // show a hint if nobody's solved it in 20s
const ROUND_TIMEOUT_MS = 60000; // auto-end the round after 60s total

function scramble(word) {
  const letters = word.split("");
  // Keep shuffling until it's actually different from the original —
  // otherwise short/repetitive words can "scramble" into themselves.
  let attempt = word;
  let tries = 0;
  while (attempt === word && tries < 10) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    attempt = letters.join("");
    tries += 1;
  }
  return attempt;
}

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/** Starts a new round. Returns { error } or { started, scrambled }. */
function startGame(jid, sendHint) {
  if (games.has(jid)) {
    return { error: "A scramble round is already in progress. Type *!scramble stop* to end it first." };
  }

  const word = pickWord();
  const scrambled = scramble(word);

  const hintTimer = setTimeout(() => {
    const game = games.get(jid);
    if (game && !game.hintShown) {
      game.hintShown = true;
      sendHint(jid, `💡 Hint: it starts with "${word[0]}" and has ${word.length} letters.`);
    }
  }, HINT_REVEAL_AFTER_MS);

  const roundTimer = setTimeout(() => {
    if (games.has(jid)) {
      games.delete(jid);
      sendHint(jid, `⏰ Time's up! The word was *${word}*.`);
    }
  }, ROUND_TIMEOUT_MS);

  games.set(jid, { word, scrambled, hintShown: false, hintTimer, roundTimer });
  return { started: true, scrambled };
}

/** Ends whatever round is running in this group, if any. */
function stopGame(jid) {
  const game = games.get(jid);
  if (!game) return false;
  clearTimeout(game.hintTimer);
  clearTimeout(game.roundTimer);
  games.delete(jid);
  return true;
}

/**
 * Handles a plain (non-prefixed) message that might be a guess at the
 * scrambled word for an in-progress round in this group. Returns true if
 * it consumed the message.
 */
async function handleScrambleGuess({ sock, jid, text }) {
  const game = games.get(jid);
  if (!game) return false;

  const guess = text.trim().toLowerCase();
  // Ignore anything that couldn't plausibly be a one-word guess — lets
  // normal chat continue alongside an active round without misfiring.
  if (!/^[a-z]+$/.test(guess)) return false;

  if (guess === game.word) {
    clearTimeout(game.hintTimer);
    clearTimeout(game.roundTimer);
    games.delete(jid);
    await sock.sendMessage(jid, { text: `🎉 Correct! The word was *${game.word}*.` });
    return true;
  }

  return false; // wrong guesses just get ignored, not called out
}

module.exports = { startGame, stopGame, handleScrambleGuess };
