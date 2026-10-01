const { recordResult, POINTS } = require("./scores");

// One active round per chat at a time, keyed by whatever chatId the
// calling platform passes in.
const games = new Map(); // chatId -> { word, guessed: Set<string>, wrong: number, players: Map<id, name> }

const WORDS = [
  "javascript", "python", "elephant", "mountain", "keyboard",
  "sandwich", "umbrella", "notebook", "triangle", "birthday",
  "calendar", "language", "sunshine", "dinosaur", "telephone",
];

const MAX_WRONG = 6;

const STAGES = [
  "```\n +---+\n     |\n     |\n     |\n    ===\n```",
  "```\n +---+\n O   |\n     |\n     |\n    ===\n```",
  "```\n +---+\n O   |\n |   |\n     |\n    ===\n```",
  "```\n +---+\n O   |\n/|   |\n     |\n    ===\n```",
  "```\n +---+\n O   |\n/|\\  |\n     |\n    ===\n```",
  "```\n +---+\n O   |\n/|\\  |\n/    |\n    ===\n```",
  "```\n +---+\n O   |\n/|\\  |\n/ \\  |\n    ===\n```",
];

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function renderWord(word, guessed) {
  return word
    .split("")
    .map((ch) => (guessed.has(ch) ? ch : "_"))
    .join(" ");
}

/** Starts a new round. Returns { error } or { started, display, stage }. */
function startGame(chatId) {
  if (games.has(chatId)) {
    return { error: "A hangman round is already in progress. Type *!hangman stop* to end it." };
  }
  const word = pickWord();
  games.set(chatId, { word, guessed: new Set(), wrong: 0, players: new Map() });
  return { started: true, display: renderWord(word, new Set()), stage: STAGES[0] };
}

/** Ends whatever round is running in this chat, if any. */
function stopGame(chatId) {
  const game = games.get(chatId);
  if (!game) return false;
  games.delete(chatId);
  return true;
}

/**
 * Handles a plain (non-prefixed) message that might be a single-letter
 * guess for an in-progress round in this chat. Returns true if it
 * consumed the message. `sendText` is (text) => Promise, scoped to this
 * chat. `senderId` / `senderName` identify who guessed: whoever finishes
 * the word wins points, and everyone who took part gets a loss if the
 * round is lost.
 */
async function handleHangmanGuess({ chatId, text, sendText, senderId, senderName }) {
  const game = games.get(chatId);
  if (!game) return false;

  const guess = text.trim().toLowerCase();
  if (!/^[a-z]$/.test(guess)) return false; // only single-letter guesses

  if (game.guessed.has(guess)) {
    await sendText(`You already guessed "${guess}".`);
    return true;
  }
  game.guessed.add(guess);
  if (senderId) game.players.set(senderId, senderName);

  if (!game.word.includes(guess)) {
    game.wrong += 1;
  }

  const display = renderWord(game.word, game.guessed);
  const won = !display.includes("_");
  const lost = game.wrong >= MAX_WRONG;

  if (won) {
    games.delete(chatId);
    let bonus = "";
    if (senderId) {
      recordResult(senderId, senderName, "hangman", { result: "win", points: POINTS.hangmanWin });
      bonus = `\n🏅 +${POINTS.hangmanWin} points${senderName ? ` for ${senderName}` : ""}`;
    }
    await sendText(`${STAGES[game.wrong]}\n${display}\n\n🎉 You got it! The word was *${game.word}*.${bonus}`);
    return true;
  }
  if (lost) {
    games.delete(chatId);
    for (const [playerId, playerName] of game.players) {
      recordResult(playerId, playerName, "hangman", { result: "loss", points: 0 });
    }
    await sendText(`${STAGES[game.wrong]}\n${display}\n\n💀 Out of guesses! The word was *${game.word}*.`);
    return true;
  }

  await sendText(`${STAGES[game.wrong]}\n${display}\n\nGuesses left: ${MAX_WRONG - game.wrong}`);
  return true;
}

module.exports = { startGame, stopGame, handleHangmanGuess };
