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

const express = require("express");
const path = require("path");
const config = require("./config");
const { startSocket, getState, onUpdate } = require("./lib/whatsapp");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// We do NOT start a socket on boot anymore — starting one here and then
// starting a second one when the user submits a phone number caused two
// sockets to race over the same session files and invalidate pairing
// codes. The first socket is now only created once someone requests a
// pairing code below.

// Website calls this after the user types their WhatsApp number.
app.post("/api/pair", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.replace(/[^0-9]/g, ""))) {
    return res.status(400).json({ error: "Enter your number with country code, digits only." });
  }

  try {
    await startSocket({ phoneNumber });
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
    await startSocket({});
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

  req.on("close", unsubscribe);
});

app.listen(config.PORT, () => {
  console.log(`Pairing website running at http://localhost:${config.PORT}`);
});
