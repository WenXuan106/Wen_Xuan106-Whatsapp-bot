const fs = require("fs");
const path = require("path");

// Persistent scoring system shared by every game and by !profile.
//
// Players are keyed by their platform id — a WhatsApp JID like
// "6591234567@s.whatsapp.net" or a Telegram numeric user id like "123456789".
// The two formats never collide, so one file holds both platforms.
const DATA_FILE = path.join(__dirname, "..", "data", "scores.json");

// Every game that can record a result, in the order they show on the card.
const GAMES = {
  quiz: { label: "Quiz" }, // !trivia / !geography / !science + !answer
  math: { label: "Math Quiz" },
  scramble: { label: "Word Scramble" },
  hangman: { label: "Hangman" },
  ttt: { label: "Tic-Tac-Toe" },
  rps: { label: "Rock Paper Scissors" },
};

// Points awarded per result. Change these numbers to rebalance the games.
const POINTS = {
  quizWin: 10,
  mathWin: 15,
  scrambleWin: 15,
  scrambleWinAfterHint: 10,
  hangmanWin: 20,
  tttWin: 25,
  tttDraw: 5,
  rpsWin: 5,
  rpsDraw: 1,
};

const LEVEL_TITLES = ["Rookie", "Challenger", "Contender", "Veteran", "Expert", "Master", "Grandmaster", "Legend"];

let data = null;
let saveTimer = null;

function load() {
  if (data) return data;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    data = parsed && typeof parsed === "object" && parsed.users ? parsed : { users: {} };
  } catch (_) {
    data = { users: {} };
  }
  return data;
}

function saveNow() {
  if (!data) return;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save scores:", err.message);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 1000);
}

// Flush anything still waiting on the debounce timer when the process ends
// (for example after !stop calls process.exit).
process.on("exit", () => {
  if (saveTimer) saveNow();
});

function platformOf(id) {
  return String(id).includes("@") ? "whatsapp" : "telegram";
}

function emptyGameRecord() {
  return { wins: 0, losses: 0, draws: 0, points: 0 };
}

function getOrCreate(id, name) {
  const users = load().users;
  const key = String(id);
  if (!users[key]) {
    users[key] = {
      name: name || null,
      platform: platformOf(key),
      firstSeen: Date.now(),
      points: 0,
      games: {},
    };
  }
  const user = users[key];
  if (name && user.name !== name) user.name = name;
  return user;
}

/** Remember who a player is (name / first-seen date) without scoring anything. */
function touchUser(id, name) {
  if (!id) return;
  const users = load().users;
  const existed = !!users[String(id)];
  const before = existed ? users[String(id)].name : null;
  const user = getOrCreate(id, name);
  if (!existed || (name && before !== name)) scheduleSave();
  return user;
}

/**
 * Records one game result for a player.
 *   game:   a key of GAMES ("quiz", "math", ...)
 *   result: "win" | "loss" | "draw"
 *   points: points to add (0 is fine, e.g. for a loss)
 * Returns the player's new total points.
 */
function recordResult(id, name, game, { result, points = 0 }) {
  if (!id || !GAMES[game]) return null;
  const user = getOrCreate(id, name);
  if (!user.games[game]) user.games[game] = emptyGameRecord();
  const record = user.games[game];

  if (result === "win") record.wins += 1;
  else if (result === "loss") record.losses += 1;
  else if (result === "draw") record.draws += 1;

  record.points += points;
  user.points += points;
  scheduleSave();
  return user.points;
}

function levelFor(points) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, points) / 25));
}

function levelStart(level) {
  return 25 * (level - 1) * (level - 1);
}

function levelEnd(level) {
  return 25 * level * level;
}

function titleFor(level) {
  return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
}

/** { rank, total } — position by points among every player the bot knows. */
function getRank(id) {
  const users = Object.entries(load().users);
  users.sort(([, a], [, b]) => b.points - a.points || a.firstSeen - b.firstSeen);
  const index = users.findIndex(([key]) => key === String(id));
  return { rank: index === -1 ? null : index + 1, total: users.length };
}

/** Everything !profile needs for one player (zeros if they've never played). */
function getProfile(id) {
  const user = load().users[String(id)] || null;
  const points = user ? user.points : 0;
  const level = levelFor(points);

  const games = Object.entries(GAMES).map(([key, info]) => ({
    key,
    label: info.label,
    ...emptyGameRecord(),
    ...((user && user.games[key]) || {}),
  }));

  const totalWins = games.reduce((sum, g) => sum + g.wins, 0);
  const totalPlayed = games.reduce((sum, g) => sum + g.wins + g.losses + g.draws, 0);
  const best = games.filter((g) => g.wins > 0).sort((a, b) => b.wins - a.wins)[0] || null;
  const { rank, total } = getRank(id);

  return {
    id: String(id),
    name: user ? user.name : null,
    platform: user ? user.platform : platformOf(id),
    firstSeen: user ? user.firstSeen : null,
    points,
    level,
    title: titleFor(level),
    levelStart: levelStart(level),
    levelEnd: levelEnd(level),
    rank,
    totalPlayers: total,
    totalWins,
    totalPlayed,
    winRate: totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : null,
    bestGame: best ? best.label : null,
    games,
  };
}

module.exports = { GAMES, POINTS, touchUser, recordResult, getProfile, getRank };
