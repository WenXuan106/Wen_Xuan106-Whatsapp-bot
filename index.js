require("dotenv").config();

// Some of Baileys' own dependencies (undici, specifically) reference the
// global `File` class that Node only exposes automatically from v20
// onward. On older Node (e.g. Railway's default v18 builder) requiring
// Baileys crashes immediately with "ReferenceError: File is not defined"
// before the app even starts. This MUST run before anything below
// requires Baileys, directly or indirectly.
if (typeof globalThis.File === "undefined") {
  try {
    globalThis.File = require("node:buffer").File;
  } catch (_) {
    // Extremely old Node without buffer.File either — build a minimal
    // shim on top of Blob, which has been available much longer.
    const { Blob } = require("node:buffer");
    globalThis.File = class File extends Blob {
      constructor(chunks, name, options = {}) {
        super(chunks, options);
        this.name = name;
        this.lastModified = options.lastModified ?? Date.now();
      }
    };
  }
}

// Baileys also expects the Web Crypto API available as the global
// `crypto` object, which Node only exposes automatically from v20
// onward. On older Node this crashes every socket attempt at runtime
// with "ReferenceError: crypto is not defined" — not at require time,
// so it looks like a connection problem rather than a Node version
// problem. Same fix pattern as the File polyfill above.
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = require("node:crypto").webcrypto;
}

// Node prefers IPv6 by default when a host advertises it. On hosts where
// IPv6 routing is actually broken (common on some cloud platforms), that
// preference makes outbound requests hang until timeout instead of
// falling back to IPv4 — which is exactly what an ETIMEDOUT reaching a
// definitely-working API like api.telegram.org usually means. Force
// IPv4 first so that dead route is never tried.
require("node:dns").setDefaultResultOrder("ipv4first");

// TEMPORARY diagnostic — remove once we know the answer.
fetch("https://api.github.com")
  .then((r) => console.log("DIAGNOSTIC: reached api.github.com, status", r.status))
  .catch((err) => console.error("DIAGNOSTIC: could NOT reach api.github.com:", err.message));

const express = require("express");
const path = require("path");
const config = require("./config");
const { startSocket, getState, onUpdate, resumeSavedSession } = require("./lib/whatsapp");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// We do NOT unconditionally start a socket on boot — starting one here and
// then starting a second one when the user submits a phone number caused
// two sockets to race over the same session files and invalidate pairing
// codes. Instead, resumeSavedSession() only starts a socket on boot if
// valid, already-registered credentials exist on disk — that path never
// requests a pairing code, so it can't collide with a fresh pairing
// attempt. Otherwise (no saved session), a socket is only created once
// someone requests a pairing code below.
resumeSavedSession();

// Website calls this after the user types their WhatsApp number.
app.post("/api/pair", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.replace(/[^0-9]/g, ""))) {
    return res.status(400).json({ error: "Enter your number with country code, digits only." });
  }

  try {
    await startSocket({ phoneNumber, forceReset: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alternative pairing method — classic QR scan, no phone number needed.
// Useful if WhatsApp is throttling phone-number pairing codes for your
// number after repeated attempts.
app.post("/api/pair-qr", async (req, res) => {
  try {
    await startSocket({ forceReset: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Website polls this to show the code and connection status live.
app.get("/api/status", (req, res) => {
  res.json(getState());
});

// Live updates via Server-Sent Events, so the page updates instantly
// instead of only on the next poll.
app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(getState())}\n\n`);

  const unsubscribe = onUpdate((state) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  });

  // Hosting proxies (Railway included) tend to silently close HTTP
  // connections that go quiet for too long. Baileys only pushes an
  // update roughly every 20-30s while awaiting a QR scan, which can be
  // just long enough to hit that idle timeout — so the stream dies and
  // the page stops receiving fresh QR codes without any visible error.
  // A comment line every 15s counts as traffic and keeps it open.
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.listen(config.PORT, () => {
  console.log(`Pairing website running at http://localhost:${config.PORT}`);
});

const { startTelegramBot } = require("./lib/telegram");
startTelegramBot();
