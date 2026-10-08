const { recordResult, POINTS } = require("./scores");
const { randomAnswer, isValidGuess } = require("./wordlewords");

// One Wordle per chat at a time, keyed by whatever chatId the calling
// platform passes in. Everyone in the chat plays the same word together and
// shares the 6 guesses; whoever guesses it wins the points.
const MAX_GUESSES = 6;
const IDLE_EXPIRE_MS = 60 * 60 * 1000; // an abandoned game is forgotten after an hour

const TILE = { g: "🟩", y: "🟨", b: "⬜" };

// chatId -> { word, guesses: [{ word, tiles }], players: Map<id, name>, starterId, lastActivity }
const games = new Map();

/** The running game for this chat, or null (forgetting it first if it was abandoned). */
function getGame(chatId) {
  const game = games.get(chatId);
  if (!game) return null;
  if (Date.now() - game.lastActivity > IDLE_EXPIRE_MS) {
    games.delete(chatId);
    return null;
  }
  return game;
}

/**
 * Scores a guess against the answer: "g" right letter in the right spot,
 * "y" right letter in the wrong spot, "b" not in the word. Repeated letters
 * are handled the way real Wordle does (a letter is only marked as many
 * times as it actually appears in the answer).
 */
function evaluate(guess, answer) {
  const result = Array(5).fill("b");
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = "g";
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === "g") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "y";
      remaining[guess[i]] -= 1;
    }
  }
  return result;
}

/** The board as text: one row per guess, then the letters ruled out and the guesses left. */
function renderBoard(game) {
  const rows = game.guesses.map((g) => `${g.tiles.map((t) => TILE[t]).join("")}  ${g.word.toUpperCase().split("").join(" ")}`);

  const inWord = new Set();
  const ruledOut = new Set();
  for (const g of game.guesses) {
    g.word.split("").forEach((ch, i) => (g.tiles[i] === "b" ? ruledOut.add(ch) : inWord.add(ch)));
  }
  for (const ch of inWord) ruledOut.delete(ch);

  const lines = rows.length ? rows : ["(no guesses yet)"];
  if (ruledOut.size) lines.push("", `❌ Not in the word: ${[...ruledOut].sort().join(" ").toUpperCase()}`);
  lines.push(`✏️ Guesses left: ${MAX_GUESSES - game.guesses.length}`);
  return lines.join("\n");
}

/** Starts a new game. Returns { error } if one is already running, or { game }. */
function startGame(chatId, starterId) {
  if (getGame(chatId)) return { error: "running" };
  const game = { word: randomAnswer(), guesses: [], players: new Map(), starterId, lastActivity: Date.now() };
  games.set(chatId, game);
  return { game };
}

/** Ends the game in this chat and returns its word, or null if none was running. */
function stopGame(chatId) {
  const game = getGame(chatId);
  if (!game) return null;
  games.delete(chatId);
  return game.word;
}

/**
 * Makes a guess. Returns one of:
 *   { error: "none" | "format" | "unknown" | "repeat" }
 *   { game, board }                         — game continues
 *   { game, board, won: true, points }      — guessed it (points already recorded)
 *   { game, board, lost: true, word }       — out of guesses (a loss recorded for everyone who played)
 */
function makeGuess(chatId, rawWord, senderId, senderName) {
  const game = getGame(chatId);
  if (!game) return { error: "none" };

  const word = String(rawWord || "").trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(word)) return { error: "format" };
  if (!isValidGuess(word)) return { error: "unknown" };
  if (game.guesses.some((g) => g.word === word)) return { error: "repeat" };

  game.guesses.push({ word, tiles: evaluate(word, game.word) });
  game.players.set(senderId, senderName);
  game.lastActivity = Date.now();
  const board = renderBoard(game);

  if (word === game.word) {
    games.delete(chatId);
    const guessesLeft = MAX_GUESSES - game.guesses.length;
    const points = POINTS.wordleWin + POINTS.wordleBonusPerGuessLeft * guessesLeft;
    recordResult(senderId, senderName, "wordle", { result: "win", points });
    return { game, board, won: true, points };
  }

  if (game.guesses.length >= MAX_GUESSES) {
    games.delete(chatId);
    for (const [playerId, playerName] of game.players) {
      recordResult(playerId, playerName, "wordle", { result: "loss", points: 0 });
    }
    return { game, board, lost: true, word: game.word };
  }

  return { game, board };
}

module.exports = { MAX_GUESSES, evaluate, getGame, startGame, stopGame, makeGuess, renderBoard };
