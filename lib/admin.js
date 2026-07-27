const { jidNormalizedUser } = require("@whiskeysockets/baileys");

/** Compares two JIDs for the same underlying account. Falls back to
 * comparing just the number portion, because WhatsApp has been rolling
 * out @lid-style participant identifiers in some groups that won't
 * string-match a plain @s.whatsapp.net JID even though they're the same
 * person — a naive === or startsWith comparison silently breaks admin
 * checks in those groups. */
function idsMatch(a, b) {
  if (!a || !b) return false;
  if (jidNormalizedUser(a) === jidNormalizedUser(b)) return true;
  const numA = a.split("@")[0].split(":")[0];
  const numB = b.split("@")[0].split(":")[0];
  return numA === numB;
}

/**
 * Checks whether a given participant JID is an admin of the group.
 * Returns { senderIsAdmin, botIsAdmin, participants } for a group jid.
 *
 * `fetchMetadata`, if provided, should be the cached getter from
 * lib/whatsapp.js (`ctx.getGroupMetadata`) so this doesn't trigger a
 * fresh network fetch on every single admin command — pass it through
 * from the command's execute(ctx).
 */
async function getGroupAdminStatus(sock, groupJid, senderJid, fetchMetadata) {
  const metadata = fetchMetadata
    ? await fetchMetadata(groupJid)
    : await sock.groupMetadata(groupJid);
  const participants = metadata.participants;

  const botJid = sock.user.id;

  const senderIsAdmin = participants.some(
    (p) => idsMatch(p.id, senderJid) && (p.admin === "admin" || p.admin === "superadmin")
  );
  const botIsAdmin = participants.some(
    (p) => idsMatch(p.id, botJid) && (p.admin === "admin" || p.admin === "superadmin")
  );

  return { senderIsAdmin, botIsAdmin, participants };
}

/** Pulls the first mentioned user's JID out of a message, if any. */
function getMentionedJid(msg) {
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  return mentions?.[0] || null;
}

/** Gets the JID of whoever a message is quoting/replying to, if any. */
function getQuotedParticipant(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.participant || null;
}

module.exports = { getGroupAdminStatus, getMentionedJid, getQuotedParticipant };
