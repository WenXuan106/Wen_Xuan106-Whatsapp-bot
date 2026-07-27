# My WhatsApp Bot

A personal WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) — the same
kind of library Knightbot-md is built on — plus a small pairing website so you connect it by
typing your phone number and entering a code in WhatsApp, instead of scanning a QR code.

**Read this first:** this connects through WhatsApp's unofficial multi-device protocol, not
WhatsApp's official Business API. That's normal for hobby bots like this one, but it means it
isn't officially sanctioned by WhatsApp/Meta — use it on a number you're comfortable
experimenting with, avoid mass-messaging or spam-like behavior, and don't be surprised if heavy
automation occasionally triggers a warning or ban on that number.

## What's included

- `index.js` — Express server: hosts the pairing website and boots the bot
- `lib/whatsapp.js` — connection handling, pairing-code requests, message routing
- `lib/commands.js` — auto-loads every file in `commands/`
- `commands/` — `!ping` and `!help`, add your own here
- `public/` — the pairing website (plain HTML/CSS/JS, no build step)
- `config.js` — prefix, port, session folder name

## Run it locally

You'll need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open **http://localhost:3000**, enter your WhatsApp number with country code (digits only,
e.g. `15551234567` for a US number), and you'll get a pairing code.

In WhatsApp on your phone: **Settings → Linked Devices → Link a device → Link with phone number
instead**, then type in the code shown on the website. Once it connects, the site shows "link
established" and the bot is live.

Your session is saved in the `auth_info_baileys/` folder so you don't need to re-pair every
restart — **never commit or share this folder**, it's equivalent to your WhatsApp login.

## Adding commands

Drop a new file in `commands/`, following this shape:

```js
module.exports = {
  name: "yourcommand",
  description: "What it does",
  async execute({ sock, msg, jid, args }) {
    await sock.sendMessage(jid, { text: "Hello from your new command!" });
  },
};
```

It's picked up automatically — no need to register it anywhere else.

## Deploying to Render (like the site you linked)

This repo includes a `render.yaml` Blueprint, so Render can configure itself automatically:

1. Push this project to a GitHub repo.
2. On Render: **New → Blueprint**, connect the repo. Render reads `render.yaml` and sets up the
   build command, start command, and disk for you.
3. Click **Apply**, then **Deploy**.
4. Once it's live, visit your Render URL to pair, the same way as locally.

**Important — this needs a paid Render plan, not the free one.** Render's persistent disks
(which is what keeps your `auth_info_baileys/` session folder from being wiped) require the
Starter plan or above (~$7/mo). The free plan doesn't support disks at all, and also spins down
after 15 minutes idle — so on free tier your WhatsApp session gets erased on basically every
restart and you'd end up re-pairing constantly. `render.yaml` is set to `plan: starter` for this
reason. If you just want to test the pairing UI without keeping a real connection alive, you can
change it to `plan: free` and delete the `disk:` block, but don't expect the bot to stay
connected.

## Notes on the Knightbot-md reference

Knightbot-md itself is a fuller-featured bot (many commands, media handling, group tools, etc.)
built the same way — Baileys underneath, a pairing/QR site on top. This project gives you that
same foundation in a smaller, easier-to-read shape so you can extend it with exactly the
commands you want, rather than inheriting a large codebase you didn't write.
