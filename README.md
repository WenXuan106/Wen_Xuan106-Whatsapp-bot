# Wen_Xuan106's WhatsApp + Telegram Bot

A personal bot that runs on **WhatsApp** (built on [Baileys](https://github.com/WhiskeySockets/Baileys))
and **Telegram** (built on [Telegraf](https://github.com/telegraf/telegraf)) at the same time, from
one set of command files. WhatsApp connects with a small pairing website — you type your phone
number and enter a code in WhatsApp instead of scanning a QR code. Telegram just needs a bot token.

**Read this first:** the WhatsApp side connects through WhatsApp's unofficial multi-device protocol,
not WhatsApp's official Business API. That's normal for hobby bots like this one, but it means it
isn't officially sanctioned by WhatsApp/Meta — use it on a number you're comfortable experimenting
with, avoid mass-messaging or spam-like behavior, and don't be surprised if heavy automation
occasionally triggers a warning or ban on that number. The Telegram side uses the official Bot API.

## What's included

- `index.js` — Express server: hosts the pairing website, boots the WhatsApp bot, and starts the Telegram bot
- `lib/whatsapp.js` — WhatsApp connection, pairing-code requests, message routing, and the WhatsApp side of the `ctx` object commands use
- `lib/telegram.js` — Telegram connection, message routing, and the Telegram side of the same `ctx` object
- `lib/commands.js` — auto-loads every file in `commands/`
- `commands/` — one file per command (list below)
- `lib/` — shared pieces: scoring (`scores.js`), the profile and weather card images (`profilecard.js`, `weathercard.js`), the games, the ban list, warnings, civilguard, welcome messages, and so on
- `public/` — the website (plain HTML/CSS/JS, no build step): the pairing page (`index.html`) and the group on/off switch (`groups.html`)
- `lib/dashboard.js` — the password-protected API behind the group switch page
- `config.js` — prefix, port, session folder, API keys, owner settings

## Run it locally

You'll need [Node.js](https://nodejs.org) 20 or newer (the project supports 20–22) and, for `!attp`,
`ffmpeg` installed on your machine.

```bash
npm install
npm start
```

Create a `.env` file next to `package.json` for your settings (see [Configuration](#configuration)).
It is git-ignored, so your keys stay out of the repo.

### Connecting WhatsApp

Open **http://localhost:3000**, enter your WhatsApp number with country code (digits only, e.g.
`15551234567` for a US number), and you'll get a pairing code.

In WhatsApp on your phone: **Settings → Linked Devices → Link a device → Link with phone number
instead**, then type in the code shown on the website. Once it connects, the site shows "link
established" and the bot is live.

Your session is saved in the `auth_info_baileys/` folder so you don't need to re-pair every
restart — **never commit or share this folder**, it's equivalent to your WhatsApp login.

### Connecting Telegram

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the prompts. It gives you a bot token.
2. Put the token in your `.env` as `TELEGRAM_BOT_TOKEN=...` and restart. If the token is empty, the Telegram bot simply doesn't start and WhatsApp is unaffected.
3. **For groups:** add the bot to the group. To use admin commands (`!kick`, `!mute`, `!promote`, `!delete`, ...) make it an admin with the matching permissions.
4. **Turn off privacy mode** in BotFather (`/setprivacy` → your bot → **Disable**), then remove and re-add the bot to the group. With privacy mode on, Telegram only shows the bot messages that start with a command, so civilguard, welcome-on-join, `!topmembers` counting and the typed game guesses (scramble, math, hangman, tic-tac-toe) can't see normal chat. Making the bot an admin also works.
5. **For `!stop` on Telegram:** set `TELEGRAM_OWNER_ID` to your numeric Telegram user id (message [@userinfobot](https://t.me/userinfobot) to find it). Leave it blank and `!stop` is disabled on Telegram.

Commands use the same `!` prefix on Telegram (plain messages, not `/commands`).

## Configuration

All settings live in `config.js` and can be overridden with environment variables or your `.env`:

| Variable | What it does |
|---|---|
| `PREFIX` | Command prefix. Default `!` |
| `PORT` | Port for the pairing website. Default `3000` |
| `AUTH_FOLDER` | Where the WhatsApp session is stored. Default `auth_info_baileys` |
| `BOT_NAME` | Bot name shown in the menu and on the weather/profile cards |
| `OWNER_NAME` | Shown as "Owner" in `!help` |
| `OWNER_NUMBER` | Optional extra WhatsApp number (digits only, with country code) that counts as owner for `!stop`. Messages sent from the bot's own linked account always count |
| `DASHBOARD_PASSWORD` | Password for the group on/off page on the website. Leave blank to turn that page off |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | Your numeric Telegram user id, for owner-only commands like `!stop` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | For `!gpt` (model defaults to `gpt-4o-mini`) |
| `OPENWEATHER_API_KEY` | For `!weather` (free key at openweathermap.org) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | For `!spotify` (free keys at developer.spotify.com) |

Commands that need a key tell the user the bot isn't configured instead of failing silently.

## Commands

Every command works on both WhatsApp and Telegram, except where noted. In groups, "admins only"
commands check the sender's admin status on whichever platform they're sent from.

**General**

- `!help` — the command menu
- `!ping`, `!milo` — check the bot is alive and see response time
- `!profile` — your game profile card (see [Scoring and profiles](#scoring-and-profiles)); reply to or @mention someone to see theirs
- `!pfp` — get someone's profile picture (reply, @mention, or use alone for your own)
- `!weather <city>` — weather card image plus a text report and 3-day outlook
- `!translate <language> <text>` — or reply to a message with `!translate <language>`
- `!topmembers` — the 5 most active members in the group by message count

**Games** (points count towards `!profile`)

- `!trivia`, `!geography`, `!science` — start a question, answer with `!answer <answer>`
- `!math` — quick math quiz, type the answer
- `!scramble` — unscramble the word
- `!hangman` — type letters to guess
- `!ttt` — tic-tac-toe; you're X, the first other player to move is O; type 1–9
- `!rps <rock|paper|scissors>` — against the bot
- `!8ball`, `!coinflip`, `!dice`, `!ship`, `!ash`, `!meme` — just for fun (no points)

**Media**

- `!song <name>` — search YouTube for a song, with info and link
- `!video <search>` — search YouTube and get the top 5 results
- `!spotify <song>` — Spotify song info and link
- `!lyrics <song>` — look up lyrics
- `!vocaloid <song>` / `!vocaloid character <name>` — VocaDB search
- `!anime <name>` / `!anime character <name>` / `!anime <nom|poke|cry|kiss|pat|hug|wink>`
- `!tts [language code] <text>` — text to speech as a voice note
- `!attp <text>` — blinking-text sticker (on Telegram it's sent as a looping animation instead, since Telegram can't show animated WebP stickers)
- `!status` — post a WhatsApp Status update. **WhatsApp only** — Telegram bots can't post Stories, so there it just says so

**AI**

- `!gpt <question>` — OpenAI (needs `OPENAI_API_KEY`)
- `!gemini <question>`

**Group admin** (admins only; the bot needs to be a group admin for most of these)

- `!kick`, `!promote`, `!demote` — reply to someone or @mention them
- `!warn`, `!warnings` — 3 warnings and the member is removed
- `!ban`, `!unban` — stop a member from using the bot's commands
- `!mute`, `!unmute` — restrict the group so only admins can send messages
- `!delete` — reply to a message with `!delete` to remove it
- `!tagall [message]` — mention everyone. On Telegram bots can't list a group's members, so this tags the admins plus everyone the bot has seen talk, in batches of 30
- `!bot off` / `!bot on` — switch the bot off or back on in just this group (plain `!bot` shows the current state). While it's off the bot ignores everything in that group — commands, games, civilguard and welcome messages — except `!bot on`. Admins and the bot owner only; the setting survives restarts. You can also do this from the website — see [Group switch on the website](#group-switch-on-the-website)
- `!groupinfo` — group details
- `!welcome on|off|set <message>` — greeting for new members; use `{user}` and `{group}` as placeholders
- `!civilguard` — bad-word filter: `on`/`off`, add/remove words, or list status

**Owner**

- `!stop` — shut the bot down completely (WhatsApp **and** Telegram, since it's one process). On WhatsApp, owner means the bot's own linked account or `OWNER_NUMBER`; on Telegram it's `TELEGRAM_OWNER_ID`

## Group switch on the website

Besides `!bot on` / `!bot off` in the chat, the website has a page that lists every group the bot is
in, each with an on/off switch — handy for silencing the bot in a group without opening it.

1. Set a password in your `.env` (or your host's environment variables) and restart:
   `DASHBOARD_PASSWORD=pick-something-long-and-private`
2. Open `/groups.html` on your bot's website (there's also a "group switch →" link at the bottom of the pairing page), enter the password, and flip the switches.

It's the same setting as `!bot on/off` — switching a group off on the website makes the bot ignore
everything in that group (commands, games, civilguard, welcome messages) until you switch it back on,
there or with `!bot on` from an admin. It takes effect immediately and survives restarts.

- **WhatsApp groups** are listed while WhatsApp is connected (pair it first if the page says it isn't).
- **Telegram groups** are listed once the bot has been added to them or has seen a message there.
- With no `DASHBOARD_PASSWORD` set, the page and its API stay closed. After 10 wrong passwords the page locks for up to 15 minutes, so guessing isn't practical.
- The password is sent with every request, so use the page over HTTPS (Render, Fly and Railway give you that automatically) rather than plain HTTP over the internet.

## Scoring and profiles

Every game feeds a shared scoring system (`lib/scores.js`):

| Game | Points |
|---|---|
| Quiz (`!trivia` / `!geography` / `!science`) | 10 per correct `!answer` |
| `!math` | 15 |
| `!scramble` | 15, or 10 if the hint was already shown |
| `!hangman` | 20 to whoever finishes the word; a lost round counts as a loss for everyone who guessed |
| `!ttt` | 25 for the winner (the other player gets a loss); 5 each for a draw |
| `!rps` | 5 for a win, 1 for a draw |

You can change any of these numbers in the `POINTS` object in `lib/scores.js`.

Points set your level (Level 2 at 25 points, Level 3 at 100, Level 4 at 225, and so on, with titles
from Rookie up to Legend). `!profile` draws a card in the same style as the weather card: your
profile picture in a round frame, name, level and XP bar, points, rank, wins, win rate, best game,
join date, and wins/losses/draws for each game. If someone has no profile picture (or it's hidden
by their privacy settings), the card shows their first initial instead.

Scores are global per person — one profile per WhatsApp number or Telegram account, shared across
every chat the bot is in.

## Where data is stored

Besides the WhatsApp session, the bot keeps small JSON files in a `data/` folder next to
`index.js`: scores, the ban list, warnings, welcome and civilguard settings, which groups the bot is switched off in, message counts for
`!topmembers`, and Telegram's seen-users list. `data/` is in `.gitignore`.

Like `auth_info_baileys/`, this folder is wiped on hosts without a persistent disk (see the
hosting notes below), which resets scores and settings. If you want it to survive redeploys, put a
persistent volume at `data/` the same way you would for the session folder.

## Group chats (WhatsApp)

Any command works in a group the same as a DM, and the admin commands are group-only. A few things
make groups fast and reliable, all in `lib/whatsapp.js` / `lib/admin.js`:

- **Group metadata is cached in memory** and handed to Baileys via `cachedGroupMetadata`, instead of
  being re-fetched from WhatsApp's servers on every group message. That network round trip was the
  main source of lag in groups. The cache refreshes itself when membership or admin status changes,
  and every 5 minutes otherwise.
- **Admin checks are LID-safe.** WhatsApp has been rolling out `@lid` participant identifiers in some
  groups; `lib/admin.js` normalizes both sides before comparing so admin checks (`!kick`, `!mute`,
  etc.) don't wrongly report the bot or an admin as "not an admin".
- **A `getMessage` store and `msgRetryCounterCache`** let Baileys resolve retry requests from other
  devices in a group without stalling.

## Adding commands

Drop a new file in `commands/`. Commands talk to the chat through a `ctx` object that works the same
on WhatsApp and Telegram, so one file covers both:

```js
module.exports = {
  name: "hello",
  description: "Say hello",
  async execute(ctx) {
    await ctx.sendText(`Hello ${ctx.senderName}! You said: ${ctx.args.join(" ")}`);
  },
};
```

It's picked up automatically — no need to register it anywhere else — **except on Telegram**, where
you also add its name to `TELEGRAM_READY_COMMANDS` in `lib/telegram.js`. (Commands not on that list
reply "isn't available on Telegram yet", so you can add WhatsApp-only commands safely.) To show it in
the `!help` menu under a category, add it to `CATEGORIES` in `commands/help.js`; anything not listed
there appears under "Other".

What's on `ctx` (identical on both platforms; see `lib/whatsapp.js` and `lib/telegram.js` for the
exact code):

- **Info:** `platform` (`"whatsapp"` or `"telegram"`), `chatId`, `senderId`, `senderName`, `isGroup`, `text`, `args`, `quotedText`, `commands`
- **Sending:** `sendText(text)`, `sendImage(urlOrBuffer, caption)`, `sendSticker(buffer)`, `sendVoice(oggOpusBuffer)`, `sendMention(text, ids)` (put `@<ctx.shortId(id)>` in the text for each id), `reply(text)`
- **People and groups:** `getTargetUser()` (whoever is @mentioned or replied to), `getAdminStatus()` → `{ senderIsAdmin, botIsAdmin }`, `listMembers()`, `getGroupInfo()`, `removeMember(id)`, `setMemberAdmin(id, makeAdmin)`, `setGroupLocked(locked)`, `getProfilePictureUrl(id)`, `hasReply()`, `deleteReplied()`, `isOwner()`, `isBotId(id)`
- **Platform-specific:** WhatsApp's `ctx` also exposes the raw `sock`, `msg`, `jid` and `getGroupMetadata` for things only WhatsApp can do (like `!status`). Telegram's `ctx` has `sendAnimation(...)`. Check `ctx.platform` before using either

To give a game points, call `recordResult(ctx.senderId, ctx.senderName, "<game>", { result: "win", points: 10 })`
from `lib/scores.js` (register a new game key in its `GAMES` object first).

## Deploying to Render — free tier

This repo includes a `render.yaml` Blueprint set up for Render's **free plan**:

1. Push this project to a GitHub repo (all files, including `lib/admin.js` — Render's error logs
   will tell you exactly which file is missing if a require fails after deploy, so check those
   first if something breaks).
2. On Render: **New → Blueprint**, connect the repo. Render reads `render.yaml` and configures
   the build/start commands automatically.
3. Add your environment variables (`TELEGRAM_BOT_TOKEN`, API keys, ...) in Render's dashboard.
4. Click **Apply**, then **Deploy**.
5. Once it's live, visit your Render URL to pair WhatsApp, same as locally. Telegram connects by itself from the token.

**The tradeoff of free tier:** Render's free plan doesn't support persistent disks, so your
`auth_info_baileys/` session folder and `data/` folder are wiped on every restart. Free-tier
services also spin down after ~15 minutes with no web traffic and cold-start on the next request —
so realistically, you'll need to re-pair WhatsApp every so often rather than staying connected
indefinitely, and scores reset with it. That's the cost of $0/month; if you want it to stay paired
continuously, that requires a paid plan (Starter, ~$7/mo) with a disk attached.

**Tip to reduce how often you re-pair:** a free uptime pinger (e.g. UptimeRobot) hitting your
Render URL every 5 minutes keeps the service from spinning down due to inactivity — it won't
survive an actual Render-initiated restart/redeploy, but it cuts down on the idle-timeout kind.

## Alternatives to Render

If responses feel slow, the biggest lever usually isn't the bot's code — it's that **Render's free
plan spins the service down after ~15 minutes of no web traffic**. The next incoming message has to
wake the whole process, reconnect, and re-establish the session before it can reply, which can take
anywhere from several seconds to tens of seconds. A free uptime pinger works around the *idle*
timeout, but not an actual Render-initiated restart, and Render's free plan still has no persistent
disk, so a real restart wipes your session either way.

Options that avoid this, roughly cheapest/simplest to most robust:

- **Fly.io** — a `fly.toml` is included in this repo. Fly's free allowance includes a small
  persistent volume, and setting `min_machines_running = 1` keeps the app up instead of scaling to
  zero, so there's no cold start on the next message. The included `fly.toml` puts the WhatsApp
  session on the `/data` volume; the bot's `data/` folder (scores, settings) is separate, so mount a
  volume for it too if you want scores to survive deploys.
- **Railway** — similar always-on model to Fly, auto-detects Node from `package.json` with no config
  file needed; add a persistent volume for `auth_info_baileys` (and `data`) in its dashboard so they
  survive restarts. Has a small usage-based free allowance, then pay-as-you-go.
- **A small VPS** (Oracle Cloud's free-tier ARM instance, or a ~$4–6/mo DigitalOcean/Contabo/Hetzner
  box) running the bot under `pm2` or a `systemd` service. More setup up front, but it's a real
  always-on machine with a normal filesystem — no platform-specific spin-down behavior to work
  around, which is the most reliable option for something that needs to hold a persistent connection.
- **A spare always-on computer or Raspberry Pi at home** — genuinely fine for a personal bot; same
  `pm2`/`systemd` approach as the VPS option.

Whichever you pick, the two things that matter are: (1) the process stays running rather than
sleeping/scaling to zero, and (2) `auth_info_baileys/` and `data/` are on a disk that survives
restarts — without both, you'll keep hitting the same "slow first reply" and "have to re-pair" issues
regardless of which platform's logo is on it.

## Notes on the Knightbot-md reference

Knightbot-md itself is a fuller-featured bot (many commands, media handling, group tools, etc.)
built the same way — Baileys underneath, a pairing/QR site on top. This project gives you that same
foundation in a smaller, easier-to-read shape so you can extend it with exactly the commands you
want, rather than inheriting a large codebase you didn't write.
