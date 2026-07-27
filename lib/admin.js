/**
 * Checks whether a given participant JID is an admin of the group.
 * Returns { senderIsAdmin, botIsAdmin, participants } for a group jid.
 */
async function getGroupAdminStatus(sock, groupJid, senderJid) {
  const metadata = await sock.groupMetadata(groupJid);
  const participants = metadata.participants;

  const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

  const senderIsAdmin = participants.some(
    (p) => p.id === senderJid && (p.admin === "admin" || p.admin === "superadmin")
  );
  const botIsAdmin = participants.some(
    (p) => p.id.startsWith(botJid.split("@")[0]) && (p.admin === "admin" || p.admin === "superadmin")
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
