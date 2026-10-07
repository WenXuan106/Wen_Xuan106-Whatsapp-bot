const config = require("../config");

// Command rate limit (anti-spam), shared by WhatsApp and Telegram.
//
// Two layers, both per person (not per chat):
//   1. A flood limit: more than RATE_LIMIT_MAX_COMMANDS commands within
//      RATE_LIMIT_WINDOW_SECONDS and the person is ignored for
//      RATE_LIMIT_BLOCK_SECONDS. They get ONE "slow down" notice, then silence,
//      so the bot never adds to the spam itself. (config.js)
//   2. A wait per heavy command (below): after using !gpt, the same person has
//      to wait before using !gpt again. A command that is turned away this
//      way doesn't count towards the flood limit.
// The bot owner is never limited.

// Seconds a person must wait before using the same command again.
const COMMAND_COOLDOWNS = {
  gpt: 10,
  gemini: 10,
  attp: 8,
  tts: 8,
  weather: 5,
  video: 5,
  song: 5,
  spotify: 5,
  lyrics: 5,
  profile: 5,
  pfp: 5,
  translate: 3,
  anime: 3,
  vocaloid: 3,
  meme: 3,
};

const COOLDOWN_NOTICE_GAP_MS = 3000; // don't repeat the "please wait" notice faster than this

const people = new Map(); // userId -> { stamps, blockedUntil, blockNoticeSent, cooldownReadyAt, lastCooldownNotice }

function stateFor(userId) {
  let s = people.get(userId);
  if (!s) {
    s = { stamps: [], blockedUntil: 0, blockNoticeSent: false, cooldownReadyAt: {}, lastCooldownNotice: 0 };
    people.set(userId, s);
  }
  return s;
}

const seconds = (ms) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Call once per command a person sends, before running it.
 * Returns { allowed, notify, message }:
 *   allowed — run the command
 *   notify  — when not allowed, whether to send `message` back (false = stay silent)
 */
function checkRateLimit({ userId, commandName, isOwner = false, now = Date.now() }) {
  const max = config.RATE_LIMIT_MAX_COMMANDS;
  const windowMs = config.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const blockMs = config.RATE_LIMIT_BLOCK_SECONDS * 1000;

  if (isOwner || !userId) return { allowed: true };

  const s = stateFor(String(userId));
  const cooldownMs = (COMMAND_COOLDOWNS[commandName] || 0) * 1000;
  const floodLimitOn = max > 0 && windowMs > 0 && blockMs > 0;

  // 1. Currently blocked for flooding.
  if (floodLimitOn && now < s.blockedUntil) {
    const notify = !s.blockNoticeSent;
    s.blockNoticeSent = true;
    return {
      allowed: false,
      notify,
      message: `⏳ Slow down! You're sending commands too fast — try again in ${seconds(s.blockedUntil - now)}s.`,
    };
  }

  // 2. This heavy command was used a moment ago.
  if (cooldownMs > 0 && now < (s.cooldownReadyAt[commandName] || 0)) {
    const notify = now - s.lastCooldownNotice >= COOLDOWN_NOTICE_GAP_MS;
    if (notify) s.lastCooldownNotice = now;
    return {
      allowed: false,
      notify,
      message: `⏳ Please wait ${seconds(s.cooldownReadyAt[commandName] - now)}s before using !${commandName} again.`,
    };
  }

  // 3. Flood check: too many commands inside the window?
  if (floodLimitOn) {
    s.stamps = s.stamps.filter((t) => now - t < windowMs);
    if (s.stamps.length >= max) {
      s.blockedUntil = now + blockMs;
      s.blockNoticeSent = true;
      s.stamps = [];
      return {
        allowed: false,
        notify: true,
        message: `⏳ Slow down! You're sending commands too fast — try again in ${seconds(blockMs)}s.`,
      };
    }
    s.stamps.push(now);
  }

  if (cooldownMs > 0) s.cooldownReadyAt[commandName] = now + cooldownMs;
  s.blockNoticeSent = false;
  return { allowed: true };
}

// Forget people who have been quiet for a while so the table doesn't grow forever.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [userId, s] of people) {
    const idle =
      now >= s.blockedUntil &&
      s.stamps.every((t) => now - t > 60000) &&
      Object.values(s.cooldownReadyAt).every((t) => now >= t);
    if (idle) people.delete(userId);
  }
}, 60000);
cleanup.unref();

module.exports = { checkRateLimit, COMMAND_COOLDOWNS };
