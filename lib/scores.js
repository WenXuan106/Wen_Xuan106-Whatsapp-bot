const fs = require("fs");
const path = require("path");
const gist = require("./gistsync");

// Persistent scoring system shared by every game and by !profile.
//
// Players are keyed by their platform id — a WhatsApp JID like
// "6591234567@s.whatsapp.net" or a Telegram numeric user id like "123456789".
// The two formats never collide, so one file holds both platforms.
//
// Points are saved in data/scores.json. If GITHUB_TOKEN and SCORES_GIST_ID are
// set (see config.js) a copy is also kept in a private GitHub Gist, and that
// copy is loaded at startup — so the points survive redeploys even on hosts
// that wipe the disk each time.
const DATA_FILE = path.join(__dirname, "..", "data", "scores.json");
const REMOTE_FILE = "scores.json"; // file name inside the gist
const REMOTE_PUSH_DELAY_MS = 5000; // wait this long after a change before uploading
const REMOTE_RETRY_MS = 30000; // retry an upload that failed

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

// Remote (gist) sync state. Uploading only starts once the gist has been
// read successfully — otherwise a failed read followed by an upload could
// overwrite good saved points with an empty list.
let remoteEnabled = false;
let remoteDirty = false;
let remotePushing = false;
let remoteTimer = null;
let initPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Turns the gist's text into the in-memory shape. Empty text means "no scores
// yet"; text that isn't valid JSON is refused (err.isCorrupt) so it never gets overwritten.
function parseRemoteScores(content) {
  if (content == null || !String(content).trim()) return { users: {} };
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    const err = new Error("the gist's scores.json isn't valid JSON");
    err.isCorrupt = true;
    throw err;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const err = new Error("the gist's scores.json isn't a JSON object");
    err.isCorrupt = true;
    throw err;
  }
  return { ...parsed, users: parsed.users && typeof parsed.users === "object" ? parsed.users : {} };
}

function scheduleRemotePush() {
  if (!remoteEnabled) return;
  remoteDirty = true;
  if (remoteTimer || remotePushing) return;
  remoteTimer = setTimeout(pushRemote, REMOTE_PUSH_DELAY_MS);
}

async function pushRemote() {
  remoteTimer = null;
  if (!remoteEnabled || remotePushing || !remoteDirty) return;
  remotePushing = true;
  remoteDirty = false;
  try {
    await gist.pushFile(REMOTE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    remoteDirty = true;
    console.error(`Scores: couldn't save to the GitHub gist (${err.message}) — will retry.`);
    remoteTimer = setTimeout(pushRemote, REMOTE_RETRY_MS);
  } finally {
    remotePushing = false;
    // More points arrived while this upload was running.
    if (remoteDirty && !remoteTimer) remoteTimer = setTimeout(pushRemote, REMOTE_PUSH_DELAY_MS);
  }
}

/** Saves right now — local file, plus the gist if it's in use. Used on shutdown. */
async function flush() {
  saveNow();
  if (!remoteEnabled) return;
  if (remoteTimer) {
    clearTimeout(remoteTimer);
    remoteTimer = null;
  }
  while (remotePushing) await sleep(200);
  if (remoteDirty) await pushRemote();
}

/**
 * Loads the saved points. Call (and wait for) this once at startup, before
 * the bots start handling messages. With a gist configured, the gist's copy
 * is loaded; otherwise the local data/scores.json is used. Never throws.
 */
function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!gist.isConfigured()) return;

    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const content = await gist.fetchFile(REMOTE_FILE);
        data = parseRemoteScores(content);
        remoteEnabled = true;
        saveNow(); // keep the local copy in step
        console.log(`Scores loaded from the GitHub gist (${Object.keys(data.users).length} players).`);

        // A redeploy sends SIGTERM first — upload any last points before exiting.
        process.once("SIGTERM", async () => {
          try {
            await Promise.race([flush(), sleep(8000)]);
          } catch (_) {
            // nothing more we can do while shutting down
          }
          // Only exit here if nothing else (like the Telegram bot) is handling SIGTERM.
          if (process.listenerCount("SIGTERM") === 0) process.exit(0);
        });
        return;
      } catch (err) {
        const status = err.response && err.response.status;
        const permanent = err.isCorrupt || status === 401 || status === 403 || status === 404;
        console.error(`Scores: couldn't read the GitHub gist (${status ? "HTTP " + status : err.message}).`);
        if (permanent || attempt === attempts) break;
        await sleep(1500 * attempt);
      }
    }
    console.error(
      "Scores: saving to the GitHub gist is OFF for this run, so the saved copy can't be overwritten. " +
        "Check GITHUB_TOKEN (needs the 'gist' permission) and SCORES_GIST_ID (a gist containing scores.json). " +
        "Points are still saved locally in data/scores.json."
    );
  })();
  return initPromise;
}

function scheduleSave() {
  scheduleRemotePush();
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

module.exports = { GAMES, POINTS, init, flush, touchUser, recordResult, getProfile, getRank };
