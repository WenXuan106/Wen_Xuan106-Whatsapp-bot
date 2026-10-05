const crypto = require("crypto");
const express = require("express");
const config = require("../config");
const { listGroups: listWhatsAppGroups } = require("./whatsapp");
const { isBotDisabled, setBotDisabled, getDisabledIds } = require("./botswitch");
const tgstate = require("./tgstate");

// API behind public/groups.html: list the groups the bot is in and switch it
// on or off in each one (the same switch as the "!bot on / off" command).
//
// Every request needs the DASHBOARD_PASSWORD from config.js in an
// "x-dashboard-password" header. With no password configured the whole API
// stays closed. Wrong guesses are limited globally (not per IP, because
// hosting proxies hide the real IP), so guessing the password is pointless.

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
let failureTimes = [];

function passwordMatches(candidate) {
  const a = crypto.createHash("sha256").update(String(candidate || "")).digest();
  const b = crypto.createHash("sha256").update(String(config.DASHBOARD_PASSWORD)).digest();
  return crypto.timingSafeEqual(a, b);
}

function requirePassword(req, res, next) {
  if (!config.DASHBOARD_PASSWORD) {
    return res.status(503).json({
      error: "The group switch is turned off. Set the DASHBOARD_PASSWORD environment variable and restart the bot to use it.",
    });
  }

  const now = Date.now();
  failureTimes = failureTimes.filter((t) => now - t < FAILURE_WINDOW_MS);
  if (failureTimes.length >= MAX_FAILURES) {
    const retryAfter = Math.ceil((failureTimes[0] + FAILURE_WINDOW_MS - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many wrong passwords. Try again in a few minutes." });
  }

  if (!passwordMatches(req.get("x-dashboard-password"))) {
    failureTimes.push(now);
    return res.status(401).json({ error: "Wrong password." });
  }

  next();
}

// Every group the bot knows about, from both platforms, with its on/off state.
async function buildGroupList() {
  const byId = new Map();

  const whatsappGroups = await listWhatsAppGroups(); // null while WhatsApp isn't connected
  for (const g of whatsappGroups || []) {
    byId.set(g.id, { id: g.id, name: g.name, platform: "whatsapp" });
  }

  for (const [id, title] of Object.entries(tgstate.getChats())) {
    byId.set(id, { id, name: title, platform: "telegram" });
  }

  // Groups that are switched off but not in either list right now (for
  // example WhatsApp isn't connected) still show up so they can be switched back on.
  for (const id of getDisabledIds()) {
    if (!byId.has(id)) {
      byId.set(id, { id, name: id, platform: id.endsWith("@g.us") ? "whatsapp" : "telegram" });
    }
  }

  const groups = [...byId.values()]
    .map((g) => ({ ...g, enabled: !isBotDisabled(g.id) }))
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));

  return {
    groups,
    whatsappConnected: whatsappGroups !== null,
    telegramConfigured: Boolean(config.TELEGRAM_BOT_TOKEN),
  };
}

function createDashboardRouter() {
  const router = express.Router();
  router.use(requirePassword);

  router.get("/", async (req, res) => {
    try {
      res.json(await buildGroupList());
    } catch (err) {
      console.error("dashboard: couldn't build the group list:", err.message);
      res.status(500).json({ error: "Couldn't load the group list." });
    }
  });

  router.post("/toggle", async (req, res) => {
    const { id, enabled } = req.body || {};
    if (typeof id !== "string" || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Send { id: string, enabled: true|false }." });
    }

    try {
      const { groups } = await buildGroupList();
      if (!groups.some((g) => g.id === id)) {
        return res.status(404).json({ error: "That group isn't one the bot knows about." });
      }
      setBotDisabled(id, !enabled);
      res.json({ ok: true, id, enabled });
    } catch (err) {
      console.error("dashboard: toggle failed:", err.message);
      res.status(500).json({ error: "Couldn't change that group." });
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
