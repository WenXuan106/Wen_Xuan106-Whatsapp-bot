const { recordResult, POINTS } = require("./scores");

// One hot potato per chat at a time. Whoever is holding the potato when the
// hidden timer runs out loses; everyone else who touched it earns points.
const MIN_FUSE_MS = 20000;
const MAX_FUSE_MS = 45000;
const MIN_PLAYERS_TO_SCORE = 3; // stops two accounts farming points off each other

// chatId -> { holderId, players: Map<id, name|null>, starterId, send, fuseTimer, warnTimer }
const games = new Map();

function getGame(chatId) {
  return games.get(chatId) || null;
}

function clearTimers(game) {
  clearTimeout(game.fuseTimer);
  clearTimeout(game.warnTimer);
}

/** Runs when the fuse burns out: the holder loses, everyone else who played wins. */
async function explode(chatId) {
  const game = games.get(chatId);
  if (!game) return;
  games.delete(chatId);
  clearTimers(game);

  const { holderId } = game;
  const survivors = [...game.players.keys()].filter((id) => id !== holderId);
  const scored = game.players.size >= MIN_PLAYERS_TO_SCORE;

  if (scored) {
    recordResult(holderId, game.players.get(holderId), "potato", { result: "loss", points: 0 });
    for (const id of survivors) {
      recordResult(id, game.players.get(id), "potato", { result: "win", points: POINTS.potatoSurvive });
    }
  }

  const holderTag = `@${game.shortId(holderId)}`;
  let text = `💥💥 *BOOM!* 💥💥\nThe hot potato exploded in ${holderTag}'s hands! 🥔🔥`;
  if (scored && survivors.length) {
    text += `\n\n🏅 +${POINTS.potatoSurvive} points for the survivors: ${survivors.map((id) => `@${game.shortId(id)}`).join(" ")}`;
  } else if (!scored) {
    text += `\n\n(It takes ${MIN_PLAYERS_TO_SCORE}+ players to score points.)`;
  }

  try {
    await game.send(text, [holderId, ...(scored ? survivors : [])]);
  } catch (err) {
    console.error("potato: couldn't announce the explosion:", err.message);
  }
}

/**
 * Starts a game with `starterId` holding the potato.
 *   send(text, ids)  sends a message with @mentions to the chat
 *   shortId(id)      how an id is written after "@" in a mention
 * Returns { error } or { game }.
 */
function startGame(chatId, starterId, starterName, send, shortId) {
  if (games.has(chatId)) return { error: "running" };

  const fuseMs = MIN_FUSE_MS + Math.random() * (MAX_FUSE_MS - MIN_FUSE_MS);
  const game = {
    holderId: starterId,
    starterId,
    players: new Map([[starterId, starterName]]),
    send,
    shortId,
    fuseTimer: setTimeout(() => explode(chatId), fuseMs),
    warnTimer: null,
  };

  // A warning once most of the fuse is gone.
  game.warnTimer = setTimeout(async () => {
    const current = games.get(chatId);
    if (!current) return;
    try {
      await current.send(`🔥 The potato is getting HOT… @${current.shortId(current.holderId)} pass it NOW!`, [current.holderId]);
    } catch (_) {
      // not worth failing over
    }
  }, fuseMs * 0.7);

  games.set(chatId, game);
  return { game };
}

/** The current holder passes the potato. Returns { error } or { game }. */
function passPotato(chatId, fromId, toId, send) {
  const game = games.get(chatId);
  if (!game) return { error: "none" };
  if (game.holderId !== fromId) return { error: "notHolder", holderId: game.holderId };
  if (toId === fromId) return { error: "self" };

  game.holderId = toId;
  if (!game.players.has(toId)) game.players.set(toId, null);
  game.send = send; // use the freshest connection for the timed messages
  return { game };
}

/** Ends the game without scoring. Returns true if one was running. */
function stopGame(chatId) {
  const game = games.get(chatId);
  if (!game) return false;
  games.delete(chatId);
  clearTimers(game);
  return true;
}

module.exports = { getGame, startGame, passPotato, stopGame, MIN_PLAYERS_TO_SCORE };
