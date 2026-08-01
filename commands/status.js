const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// WhatsApp only shows a status update to people whose JIDs are listed in
// statusJidList — it's not enough to just send it to 'status@broadcast'.
// Since this bot doesn't maintain a full contacts store, it builds a
// reasonable list from the chat the command was run in: every other
// participant if run in a group, or the other person if run in a DM.
// Anyone @mentioned in the command is added on top of that.
async function buildStatusJidList({ sock, jid, msg, getGroupMetadata }) {
  const botJid = sock.user?.id;
  const viewers = new Set();

  if (jid.endsWith("@g.us")) {
    const metadata = await getGroupMetadata(jid);
    for (const p of metadata.participants) {
      if (p.id !== botJid) viewers.add(p.id);
    }
  } else if (jid !== "status@broadcast") {
    viewers.add(jid);
  }

  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  for (const m of mentioned) {
    if (m !== botJid) viewers.add(m);
  }

  return [...viewers];
}

function getQuotedMedia(msg) {
  const context = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = context?.quotedMessage;
  if (!quoted) return null;

  const type = quoted.imageMessage ? "image" : quoted.videoMessage ? "video" : null;
  if (!type) return null;

  // downloadMediaMessage needs a full WAMessage-shaped object (key + message),
  // not just the bare quotedMessage payload, so this reconstructs one.
  const syntheticMessage = {
    key: {
      remoteJid: msg.key.remoteJid,
      id: context.stanzaId,
      fromMe: false,
      participant: context.participant,
    },
    message: quoted,
  };

  return { type, syntheticMessage };
}

module.exports = {
  name: "status",
  description: "Post a WhatsApp Status update (text, or reply to an image/video), e.g. !status Good morning!",
  async execute({ sock, jid, msg, args, getGroupMetadata }) {
    const caption = args.join(" ").trim();
    const quotedMedia = getQuotedMedia(msg);

    if (!quotedMedia && !caption) {
      return sock.sendMessage(
        jid,
        { text: "Usage: !status <text>  —  or reply to an image/video with !status [optional caption]" },
        { quoted: msg }
      );
    }

    try {
      const statusJidList = await buildStatusJidList({ sock, jid, msg, getGroupMetadata });

      let content;
      if (quotedMedia) {
        const buffer = await downloadMediaMessage(
          quotedMedia.syntheticMessage,
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
        content = quotedMedia.type === "image"
          ? { image: buffer, caption: caption || undefined }
          : { video: buffer, caption: caption || undefined };
      } else {
        content = { text: caption };
      }

      await sock.sendMessage("status@broadcast", content, {
        broadcast: true,
        statusJidList,
      });

      await sock.sendMessage(
        jid,
        {
          text: statusJidList.length
            ? `✅ Status posted (visible to ${statusJidList.length} contact${statusJidList.length === 1 ? "" : "s"} from this chat).`
            : "✅ Status posted. (Note: run this from a group or DM so I know who to make it visible to — an empty viewer list means almost no one will see it.)",
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error("status command failed:", err.stack || err.message);
      await sock.sendMessage(jid, { text: "❌ Failed to post the status." }, { quoted: msg });
    }
  },
};
