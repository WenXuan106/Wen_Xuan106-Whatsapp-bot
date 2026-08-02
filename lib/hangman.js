// One active game per group at a time, keyed by group jid. Same approach
// as lib/tictactoe.js — in-memory is fine since a hangman round is short-lived.
const games = new Map(); // jid -> game state

const WORDS = [
  "javascript", "baileys", "whatsapp", "hangman", "computer",
  "keyboard", "internet", "function", "variable", "database",
];

const MAX_WRONG = 6;

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function renderMasked(word, guessed) {
  return word
    .split("")
    .map((ch) => (guessed.includes(ch) ? ch : "_"))
    .join(" ");
}

function renderStatus(game) {
  const lines = [
    "🎮 *Hangman*",
    renderMasked(game.word, game.guessed),
    "",
    `❌ Wrong guesses: ${game.wrong.length}/${MAX_WRONG}${game.wrong.length ? ` (${game.wrong.join(", ")})` : ""}`,
  ];
  return lines.join("\n");
}

/** Returns the existing game for this group, if any. */
function getGame(jid) {
  return games.get(jid) || null;
}

/** Starts a new game. Returns { error } or { started, game }. */
function startGame(jid) {
  if (games.has(jid)) {
    return { error: "A game is already in progress in this group. Type *!hangman stop* to end it first." };
  }
  const game = { word: pickWord(), guessed: [], wrong: [] };
  games.set(jid, game);
  return { started: true, game };
}

/** Ends whatever game is running in this group, if any. */
function stopGame(jid) {
  const had = games.has(jid);
  games.delete(jid);
  return had;
}

/**
 * Handles a plain (non-prefixed) message that might be a single-letter
 * guess for an in-progress game in this group. Returns true if it
 * consumed the message.
 */
async function handleHangmanGuess({ sock, jid, text }) {
  const game = games.get(jid);
  if (!game) return false;

  const letter = text.trim().toLowerCase();
  if (!/^[a-z]$/.test(letter)) return false;

  if (game.guessed.includes(letter) || game.wrong.includes(letter)) {
    await sock.sendMessage(jid, { text: `You already guessed "${letter}". Try another letter.` });
    return true;
  }

  if (game.word.includes(letter)) {
    game.guessed.push(letter);
    const solved = game.word.split("").every((ch) => game.guessed.includes(ch));
    if (solved) {
      await sock.sendMessage(jid, {
        text: `🎉 Solved it! The word was *${game.word}*.`,
      });
      games.delete(jid);
      return true;
    }
    await sock.sendMessage(jid, { text: renderStatus(game) });
    return true;
  }

  game.wrong.push(letter);
  if (game.wrong.length >= MAX_WRONG) {
    await sock.sendMessage(jid, {
      text: `💀 Out of guesses! The word was *${game.word}*.`,
    });
    games.delete(jid);
    return true;
  }

  await sock.sendMessage(jid, { text: renderStatus(game) });
  return true;
}

module.exports = { getGame, startGame, stopGame, handleHangmanGuess, renderStatus };
