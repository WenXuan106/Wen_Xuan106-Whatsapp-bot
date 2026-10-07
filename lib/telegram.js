const { Telegraf } = require("telegraf");
const config = require("../config");
const { loadCommands } = require("./commands");
const { handleScrambleGuess } = require("./scramble");
const { handleMathAnswer } = require("./mathquiz");
const { handleHangmanGuess } = require("./hangman");
const { handleTicTacToeMove } = require("./tictactoe");
const { handleCivilguardGeneric } = require("./civilguard");
const { getSettings: getWelcomeSettings, buildMessage: buildWelcomeMessage } = require("./welcome");
const { isBanned } = require("./banlist");
const { incrementCount } = require("./topmembers");
const tgstate = require("./tgstate");
const { touchUser } = require("./scores");
const { isBotDisabled } = require("./botswitch");
const { checkRateLimit } = require("./ratelimit");

const commands = loadCommands();

// Commands that run on Telegram. Every command now goes through the
// platform-neutral ctx methods below (sendText, sendMention, getTargetUser,
// getAdminStatus, removeMember, getProfilePictureUrl, ...) instead of calling
// Baileys directly.
const TELEGRAM_READY_COMMANDS = new Set([
  "ping",
  "bot",
  "profile",
  "milo",
  "help",
  "weather",
  "8ball",
  "coinflip",
  "dice",
  "rps",
  "trivia",
  "geography",
  "science",
  "answer",
  "song",
  "video",
  "spotify",
  "vocaloid",
  "anime",
  "scramble",
  "math",
  "hangman",
  "ttt",
  "ship",
  "meme",
  "translate",
  "ash",
  "pfp",
  "lyrics",
  "gpt",
  "gemini",
  "tts",
  "attp",
  "status",
  "stop",
  "ban",
  "unban",
  "warn",
  "warnings",
  "unwarn",
  "kick",
  "promote",
  "demote",
  "mute",
  "unmute",
  "tagall",
  "groupinfo",
  "topmembers",
  "delete",
  "welcome",
  "civilguard",
]);

const ANONYMOUS_ADMIN_BOT_ID = 1087968824; // "GroupAnonymousBot"

/** "First Last", falling back to @username, then the numeric id. */
function displayNameOf(user) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || String(user.id);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAdminStatus(member) {
  return member?.status === "administrator" || member?.status === "creator";
}

/**
 * Turns plain text that contains "@<userId>" tags into Telegram HTML where
 * each tag is a real mention link, e.g. "@12345" -> <a href="tg://user?id=12345">Name</a>.
 * Everything else in the text is HTML-escaped so it's shown literally.
 */
function toMentionHtml(text, ids, chatId) {
  // *bold* (WhatsApp style) becomes real bold on Telegram.
  let html = escapeHtml(text).replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, "<b>$1</b>");
  for (const id of ids) {
    const idStr = String(id);
    const name = tgstate.getName(idStr, chatId) || "user";
    const link = `<a href="tg://user?id=${idStr}">${escapeHtml(name)}</a>`;
    html = html.replace(new RegExp(`@${escapeRegExp(idStr)}(?!\\d)`, "g"), () => link);
  }
  return html;
}


function buildTelegramContext(tgCtx, args, commandName) {
  const chatId = tgCtx.chat.id;
  const isGroup = tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup";
  const text = tgCtx.message?.text || "";
  const messageTimestampMs = tgCtx.message?.date ? tgCtx.message.date * 1000 : Date.now();
  const replied = tgCtx.message?.reply_to_message || null;
  const quotedText = replied?.text || replied?.caption || null;
  const senderId = String(tgCtx.from.id);
  const senderName = displayNameOf(tgCtx.from);
  const telegram = tgCtx.telegram;

  async function getMembership(userId) {
    return telegram.getChatMember(chatId, Number(userId));
  }

  const platformCtx = {
    platform: "telegram",
    chatId,
    senderId,
    senderName,
    commandName,
    isGroup,
    text,
    args,
    messageTimestampMs,
    quotedText,
    commands,

    async sendText(msgText) {
      return tgCtx.reply(msgText);
    },
    async sendImage(source, caption) {
      const media = Buffer.isBuffer(source) ? { source } : source;
      return tgCtx.replyWithPhoto(media, caption ? { caption } : undefined);
    },
    async sendSticker(buffer) {
      return tgCtx.replyWithSticker({ source: buffer });
    },
    async reply(msgText) {
      return tgCtx.reply(msgText);
    },

    // --- Platform-neutral helpers (same names as in lib/whatsapp.js) ------

    /** How an id is written after "@" in a mention tag. */
    shortId(id) {
      return String(id);
    },
    /** Sends text; each id in `ids` is turned into a real mention. The text
     * must contain "@<shortId>" for every id listed. */
    async sendMention(msgText, ids = []) {
      const html = toMentionHtml(msgText, ids, chatId);
      return tgCtx.reply(html, { parse_mode: "HTML", disable_web_page_preview: true });
    },
    /** Sends a playable voice note from Ogg/Opus bytes. */
    async sendVoice(buffer) {
      return tgCtx.replyWithVoice({ source: buffer });
    },
    /** Sends an mp4 as an auto-playing looping animation (Telegram-only). */
    async sendAnimation(source) {
      const media = Buffer.isBuffer(source) ? { source } : source;
      return tgCtx.replyWithAnimation(media);
    },

    /** Whoever the command @mentions, or else whoever it replies to. Null if neither. */
    getTargetUser() {
      const entities = tgCtx.message?.entities || [];
      for (const entity of entities) {
        if (entity.type === "text_mention" && entity.user) {
          tgstate.rememberUser(chatId, entity.user);
          return String(entity.user.id);
        }
        if (entity.type === "mention") {
          const username = text.substr(entity.offset, entity.length);
          const id = tgstate.findByUsername(chatId, username);
          if (id) return id;
        }
      }
      if (replied?.from && !replied.from.is_bot) {
        tgstate.rememberUser(chatId, replied.from);
        return String(replied.from.id);
      }
      return null;
    },
    /** URL of a user's profile picture, or null if they have none / it's hidden.
     * The URL contains the bot token, so only download it — never send it to a chat. */
    async getProfilePictureUrl(id) {
      try {
        const photos = await telegram.getUserProfilePhotos(Number(id), 0, 1);
        const sizes = photos?.photos?.[0];
        if (!sizes || sizes.length === 0) return null;
        const largest = sizes[sizes.length - 1];
        const link = await telegram.getFileLink(largest.file_id);
        return String(link);
      } catch (err) {
        console.error("getProfilePictureUrl failed:", err.message);
        return null;
      }
    },
    /** Telegram ids are already exact, so there's nothing to convert. */
    async resolveMember(id) {
      return String(id);
    },
    /** { senderIsAdmin, botIsAdmin } for this group. */
    async getAdminStatus() {
      if (!isGroup) return { senderIsAdmin: false, botIsAdmin: false };

      // Admins posting anonymously show up as the group itself.
      const anonymousAdmin =
        tgCtx.message?.sender_chat?.id === chatId || tgCtx.from.id === ANONYMOUS_ADMIN_BOT_ID;

      const botId = tgCtx.botInfo?.id ?? (await telegram.getMe()).id;
      const [senderMember, botMember] = await Promise.all([
        anonymousAdmin ? Promise.resolve(null) : getMembership(tgCtx.from.id),
        getMembership(botId),
      ]);
      return {
        senderIsAdmin: anonymousAdmin || isAdminStatus(senderMember),
        botIsAdmin: isAdminStatus(botMember),
      };
    },
    isBotId(id) {
      return String(id) === String(tgCtx.botInfo?.id);
    },
    isOwner() {
      return !!config.TELEGRAM_OWNER_ID && senderId === String(config.TELEGRAM_OWNER_ID).trim();
    },

    /** Every member id we can know about. Telegram bots can't list a group's
     * members, so this is the admins plus everyone the bot has seen talk. */
    async listMembers() {
      const ids = new Set(tgstate.getChatUserIds(chatId));
      try {
        const admins = await telegram.getChatAdministrators(chatId);
        for (const admin of admins) {
          if (admin.user.is_bot) continue;
          tgstate.rememberUser(chatId, admin.user);
          ids.add(String(admin.user.id));
        }
      } catch (err) {
        console.error("listMembers: couldn't fetch administrators:", err.message);
      }
      return [...ids];
    },
    /** { name, id, ownerId, createdAt, memberCount, adminCount, description }. */
    async getGroupInfo() {
      const [chat, memberCount, admins] = await Promise.all([
        telegram.getChat(chatId),
        telegram.getChatMembersCount(chatId),
        telegram.getChatAdministrators(chatId),
      ]);
      const owner = admins.find((a) => a.status === "creator");
      return {
        name: chat.title || String(chatId),
        id: String(chatId),
        ownerId: owner ? String(owner.user.id) : null,
        createdAt: "Unknown", // Telegram doesn't expose this to bots
        memberCount,
        adminCount: admins.length,
        description: chat.description || null,
      };
    },

    /** Removes a member (they can rejoin via invite link, like a WhatsApp kick). */
    async removeMember(id) {
      try {
        await telegram.banChatMember(chatId, Number(id));
        await telegram.unbanChatMember(chatId, Number(id), { only_if_banned: true });
        tgstate.forgetUser(chatId, id);
        return true;
      } catch (err) {
        console.error("removeMember failed:", err.message);
        return false;
      }
    },
    /** Promotes (makeAdmin = true) or demotes a member. Resolves to true on success. */
    async setMemberAdmin(id, makeAdmin) {
      try {
        await telegram.promoteChatMember(chatId, Number(id), {
          can_manage_chat: makeAdmin,
          can_delete_messages: makeAdmin,
          can_restrict_members: makeAdmin,
          can_invite_users: makeAdmin,
          can_pin_messages: makeAdmin,
          can_manage_video_chats: makeAdmin,
          can_change_info: false,
          can_promote_members: false,
        });
        return true;
      } catch (err) {
        console.error("setMemberAdmin failed:", err.message);
        return false;
      }
    },
    /** locked = true: only admins can send. Throws if Telegram refuses. */
    async setGroupLocked(locked) {
      if (locked) {
        // Remember the group's normal permissions so !unmute can restore them.
        const chat = await telegram.getChat(chatId);
        if (chat.permissions?.can_send_messages !== false) {
          tgstate.savePermissions(chatId, chat.permissions || null);
        }
        await telegram.setChatPermissions(chatId, { can_send_messages: false });
        return;
      }
      const saved = tgstate.takePermissions(chatId);
      await telegram.setChatPermissions(
        chatId,
        saved && Object.keys(saved).length
          ? { ...saved, can_send_messages: true }
          : {
              can_send_messages: true,
              can_send_audios: true,
              can_send_documents: true,
              can_send_photos: true,
              can_send_videos: true,
              can_send_video_notes: true,
              can_send_voice_notes: true,
              can_send_polls: true,
              can_send_other_messages: true,
              can_add_web_page_previews: true,
              can_invite_users: true,
            }
      );
    },

    /** True if this command is a reply to another message. */
    hasReply() {
      return !!replied;
    },
    /** Deletes the message this command replied to. Resolves to true on success. */
    async deleteReplied() {
      if (!replied) return false;
      try {
        await telegram.deleteMessage(chatId, replied.message_id);
        return true;
      } catch (err) {
        console.error("deleteReplied failed:", err.message);
        return false;
      }
    },
    /** Stops the platform connection (used by !stop just before exiting). */
    async shutdown() {
      // The Telegraf instance is stopped by the SIGINT/SIGTERM handlers /
      // process.exit in !stop, so there's nothing extra to close here.
    },
  };

  return platformCtx;
}

async function launchWithRetry(bot, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await bot.launch();
      console.log("Telegram bot connected.");
      return;
    } catch (err) {
      lastErr = err;
      const delayMs = Math.min(30000, 2000 * 2 ** (i - 1));
      console.error(
        `Telegram launch attempt ${i}/${attempts} failed (${err.message}), retrying in ${delayMs}ms…`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error("Telegram bot failed to start after several attempts (WhatsApp is unaffected):", lastErr?.message);
}

function startTelegramBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup.");
    return null;
  }

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  // Welcome greeting for new members (the Telegram equivalent of WhatsApp's
  // group-participants "add" event).
  bot.on("new_chat_members", async (tgCtx) => {
    try {
      const chatId = tgCtx.chat.id;
      const isGroup = tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup";
      if (!isGroup) return;

      if (isBotDisabled(chatId)) return; // "!bot off" — stay silent in this group

      const settings = getWelcomeSettings(String(chatId));
      if (!settings.enabled) return;

      const groupName = tgCtx.chat.title || String(chatId);
      for (const member of tgCtx.message.new_chat_members) {
        if (member.is_bot) continue;
        tgstate.rememberUser(chatId, member);
        const id = String(member.id);
        const greeting = buildWelcomeMessage(settings, id, groupName);
        await tgCtx.reply(toMentionHtml(greeting, [id], chatId), {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      }
    } catch (err) {
      console.error("Telegram welcome handler error:", err);
    }
  });

  // The bot itself being added to or removed from a group — keeps the
  // website's group list up to date even before anyone says anything.
  bot.on("my_chat_member", (tgCtx) => {
    try {
      const chat = tgCtx.chat;
      if (chat.type !== "group" && chat.type !== "supergroup") return;
      const status = tgCtx.update?.my_chat_member?.new_chat_member?.status;
      if (status === "left" || status === "kicked") tgstate.forgetChat(chat.id);
      else tgstate.rememberChat(chat.id, chat.title);
    } catch (_) {
      // best-effort bookkeeping
    }
  });

  bot.on("left_chat_member", (tgCtx) => {
    try {
      const member = tgCtx.message?.left_chat_member;
      if (member) tgstate.forgetUser(tgCtx.chat.id, member.id);
    } catch (_) {
      // best-effort cache cleanup
    }
  });

  bot.on("text", async (tgCtx) => {
    const text = tgCtx.message.text || "";
    const chatId = tgCtx.chat.id;
    const isGroup = tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup";
    const senderId = String(tgCtx.from.id);

    if (isGroup) tgstate.rememberChat(chatId, tgCtx.chat.title);

    // "!bot off" silences the bot in a group: nothing is handled there except
    // "!bot" itself (so an admin can turn it back on).
    if (isGroup && isBotDisabled(chatId)) {
      const firstWord = text.startsWith(config.PREFIX)
        ? text.slice(config.PREFIX.length).trim().split(/\s+/)[0].toLowerCase()
        : "";
      if (firstWord !== "bot") return;
    }

    if (isGroup) {
      tgstate.rememberUser(chatId, tgCtx.from);
      try {
        incrementCount(String(chatId), senderId);
      } catch (err) {
        console.error("Telegram message counting error:", err);
      }
    }

    // Civilguard: like on WhatsApp, this has to see every group message, not
    // just "!" commands. Runs before the game hooks so a flagged message
    // gets deleted instead of being treated as a guess.
    if (isGroup && !tgCtx.from.is_bot) {
      try {
        const base = buildTelegramContext(tgCtx, []);
        const acted = await handleCivilguardGeneric({
          chatId: String(chatId),
          senderId,
          isGroup,
          text,
          getAdminStatus: () => base.getAdminStatus(),
          deleteMessage: () => tgCtx.telegram.deleteMessage(chatId, tgCtx.message.message_id),
          removeMember: (id) => base.removeMember(id),
          sendMention: (t, ids) => base.sendMention(t, ids),
          shortId: (id) => base.shortId(id),
        });
        if (acted) return;
      } catch (err) {
        console.error("Telegram civilguard detection error:", err);
      }
    }

    // Same idea as WhatsApp's game hook — scramble/math/hangman/ttt need to
    // see plain guesses ("computer", "42", "a", "5"), not just "!" commands.
    try {
      const sendTextForGames = (t) => tgCtx.reply(t);
      // Who is playing — used by the scoring system (see lib/scores.js).
      const senderName = displayNameOf(tgCtx.from);

      const hangmanHandled = await handleHangmanGuess({
        chatId,
        text,
        sendText: sendTextForGames,
        senderId,
        senderName,
      });
      if (hangmanHandled) return;

      const tttHandled = await handleTicTacToeMove({
        chatId,
        senderId,
        senderName,
        text,
        sendText: sendTextForGames,
      });
      if (tttHandled) return;

      const scrambleHandled = await handleScrambleGuess({
        chatId,
        text,
        sendText: sendTextForGames,
        senderId,
        senderName,
      });
      if (scrambleHandled) return;

      const mathHandled = await handleMathAnswer({
        chatId,
        text,
        sendText: sendTextForGames,
        senderId,
        senderName,
      });
      if (mathHandled) return;
    } catch (err) {
      console.error("Telegram game move handling error:", err);
    }

    if (!text.startsWith(config.PREFIX)) return;

    const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
    const command = commands.get(cmdName.toLowerCase());
    if (!command) return;

    // Users on the bot-wide ban list (!ban) are silently ignored.
    if (isBanned(senderId)) return;

    if (!TELEGRAM_READY_COMMANDS.has(command.name)) {
      await tgCtx.reply(`"${command.name}" isn't available on Telegram yet — still being migrated over from WhatsApp.`);
      return;
    }

    // Anti-spam: see lib/ratelimit.js (limits live in config.js).
    const ownerId = String(config.TELEGRAM_OWNER_ID || "").trim();
    const limit = checkRateLimit({
      userId: senderId,
      commandName: command.name,
      isOwner: !!ownerId && senderId === ownerId,
    });
    if (!limit.allowed) {
      if (limit.notify) {
        try {
          await tgCtx.reply(limit.message);
        } catch (err) {
          console.error("Failed to send the rate-limit notice:", err.message);
        }
      }
      return;
    }

    const platformCtx = buildTelegramContext(tgCtx, args, cmdName.toLowerCase());
    touchUser(platformCtx.senderId, platformCtx.senderName);

    try {
      await command.execute(platformCtx);
    } catch (err) {
      console.error(`Error running Telegram command "${cmdName}":`, err);
      try {
        await tgCtx.reply("⚠️ Something went wrong running that command.");
      } catch (sendErr) {
        console.error("Also failed to send the Telegram error notice:", sendErr);
      }
    }
  });

  launchWithRetry(bot);
  console.log("Telegram bot starting…");

  process.once("SIGINT", () => {
    try {
      bot.stop("SIGINT");
    } catch (err) {
      console.error("Telegram bot.stop() on SIGINT failed (harmless if it was never running):", err.message);
    }
  });
  process.once("SIGTERM", () => {
    try {
      bot.stop("SIGTERM");
    } catch (err) {
      console.error("Telegram bot.stop() on SIGTERM failed (harmless if it was never running):", err.message);
    }
  });

  return bot;
}

module.exports = { startTelegramBot, buildTelegramContext };
