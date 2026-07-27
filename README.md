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

## Group chats

Group support was already wired up (any command works in a group the same as
a DM, and `!kick`/`!mute`/`!unmute`/`!promote`/`!demote`/`!delete` are
group-only admin commands), but two things made it feel slow or occasionally
wrong in groups, both now fixed in `lib/whatsapp.js` / `lib/admin.js`:

- **Group metadata is now cached in memory** and handed to Baileys via
  `cachedGroupMetadata`, instead of being re-fetched from WhatsApp's servers
  on every single group message. That network round trip was the main
  source of lag in groups. The cache refreshes itself automatically when
  membership or admin status actually changes, and every 5 minutes
  otherwise.
- **Admin checks are now LID-safe.** WhatsApp has been rolling out `@lid`
  participant identifiers in some groups; the old code compared JIDs with
  plain string equality, which could silently report the bot (or an admin)
  as "not an admin" even when it was, breaking `!kick`/`!mute`/etc. in
  those groups. `lib/admin.js` now normalizes both sides before comparing.
- **Added a `getMessage` store and `msgRetryCounterCache`**, which Baileys
  uses to resolve retry requests from other devices in a group without
  stalling — another common cause of a bot feeling unresponsive in busy
  groups.

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

## Deploying to Render — free tier

This repo includes a `render.yaml` Blueprint set up for Render's **free plan**:

1. Push this project to a GitHub repo (all files, including `lib/admin.js` — Render's error logs
   will tell you exactly which file is missing if a require fails after deploy, so check those
   first if something breaks).
2. On Render: **New → Blueprint**, connect the repo. Render reads `render.yaml` and configures
   the build/start commands automatically.
3. Click **Apply**, then **Deploy**.
4. Once it's live, visit your Render URL to pair, same as locally.

**The tradeoff of free tier:** Render's free plan doesn't support persistent disks, so your
`auth_info_baileys/` session folder is wiped on every restart. Free-tier services also spin down
after ~15 minutes with no web traffic and cold-start on the next request — so realistically,
you'll need to re-pair every so often rather than staying connected indefinitely. That's the
cost of $0/month; if you want it to stay paired continuously, that requires a paid plan
(Starter, ~$7/mo) with a disk attached — happy to switch the config back to that if you change
your mind later.

**Tip to reduce how often you re-pair:** a free uptime pinger (e.g. UptimeRobot) hitting your
Render URL every 5 minutes keeps the service from spinning down due to inactivity — it won't
survive an actual Render-initiated restart/redeploy, but it cuts down on the idle-timeout kind.

## Alternatives to Render

If responses feel slow, the biggest lever usually isn't the bot's code — it's
that **Render's free plan spins the service down after ~15 minutes of no web
traffic**. The next incoming WhatsApp message has to wake the whole
process, reconnect the socket, and re-establish the session before it can
reply, which can take anywhere from several seconds to tens of seconds. A
free uptime pinger (mentioned above) works around the *idle* timeout, but
not an actual Render-initiated restart, and Render's free plan still has no
persistent disk, so a real restart wipes your session either way.

Options that avoid this, roughly cheapest/simplest to most robust:

- **Fly.io** — a `fly.toml` is included in this repo. Fly's free allowance
  includes a small persistent volume, and setting `min_machines_running = 1`
  keeps the app up instead of scaling to zero, so there's no cold start on
  the next message. Probably the closest drop-in replacement for Render here.
- **Railway** — similar always-on model to Fly, auto-detects Node from
  `package.json` with no config file needed; add a persistent volume mounted
  at the `auth_info_baileys` folder path in its dashboard so the session
  survives restarts. Has a small usage-based free allowance, then pay-as-you-go.
- **A small VPS** (Oracle Cloud's free-tier ARM instance, or a ~$4–6/mo
  DigitalOcean/Contabo/Hetzner box) running the bot under `pm2` or a
  `systemd` service. More setup up front, but it's a real always-on machine
  with a normal filesystem — no platform-specific spin-down behavior to
  work around at all, which is the most reliable option for something that
  needs to hold a persistent connection like this.
- **A spare always-on computer or Raspberry Pi at home** — genuinely fine
  for a personal bot; same `pm2`/`systemd` approach as the VPS option.

Whichever you pick, the two things that matter are: (1) the process stays
running rather than sleeping/scaling to zero, and (2) `auth_info_baileys/`
is on a disk that survives restarts — without both, you'll keep hitting the
same "slow first reply" and "have to re-pair" issues regardless of which
platform's logo is on it. Happy to write out the Railway or VPS setup in
more detail if you tell me which one you want to go with.

## Notes on the Knightbot-md reference

Knightbot-md itself is a fuller-featured bot (many commands, media handling, group tools, etc.)
built the same way — Baileys underneath, a pairing/QR site on top. This project gives you that
same foundation in a smaller, easier-to-read shape so you can extend it with exactly the
commands you want, rather than inheriting a large codebase you didn't write.
