const { jidNormalizedUser } = require("@whiskeysockets/baileys");

/** Compares two JIDs for the same underlying account. Falls back to
 * comparing just the number portion for two plain phone-number JIDs. This
 * fallback is deliberately NOT used when either side is a @lid JID — @lid
 * identifiers are opaque IDs WhatsApp assigns, not derived from the phone
 * number, so their numeric portion has no relationship to a phone number
 * and comparing them that way is meaningless (and can coincidentally
 * collide with an unrelated number). */
function idsMatch(a, b) {
  if (!a || !b) return false;
  if (jidNormalizedUser(a) === jidNormalizedUser(b)) return true;
  if (a.endsWith("@lid") || b.endsWith("@lid")) return false;
  const numA = a.split("@")[0].split(":")[0];
  const numB = b.split("@")[0].split(":")[0];
  return numA === numB;
}

/** True if `jid` matches any candidate in `candidates` (falsy entries skipped). */
function matchesAny(jid, candidates) {
  return candidates.some((c) => c && idsMatch(jid, c));
}

/**
 * WhatsApp is rolling out @lid identifiers alongside plain phone-number
 * JIDs, and which one shows up in a group's participant list vs. on an
 * incoming message doesn't always match — the same person can appear as
 * a @lid in one place and a @s.whatsapp.net JID in the other, so a single
 * JID comparison can silently and incorrectly say "not an admin". Baileys
 * puts the alternate form of the sender's JID on `key.participantAlt`
 * when it knows one, so collect both known forms of "who sent this" here
 * and match a participant against either.
 */
function getSenderCandidates(msg) {
  return [msg.key.participant, msg.key.participantAlt, msg.key.remoteJid].filter(Boolean);
}

/**
 * Checks whether the sender of `msg` (and the bot itself) are admins of
 * the group. Returns { senderIsAdmin, botIsAdmin, participants }.
 *
 * `fetchMetadata`, if provided, should be the cached getter from
 * lib/whatsapp.js (`ctx.getGroupMetadata`) so this doesn't trigger a
 * fresh network fetch on every single admin command — pass it through
 * from the command's execute(ctx).
 */
async function getGroupAdminStatus(sock, groupJid, msg, fetchMetadata) {
  const metadata = fetchMetadata
    ? await fetchMetadata(groupJid)
    : await sock.groupMetadata(groupJid);
  const participants = metadata.participants;

  const senderCandidates = getSenderCandidates(msg);
  // The bot's own identity can likewise show up as either form depending
  // on the group, so check both known forms of "us" too.
  const botCandidates = [sock.user?.id, sock.authState?.creds?.me?.lid].filter(Boolean);

  const senderIsAdmin = participants.some(
    (p) => matchesAny(p.id, senderCandidates) && (p.admin === "admin" || p.admin === "superadmin")
  );
  const botIsAdmin = participants.some(
    (p) => matchesAny(p.id, botCandidates) && (p.admin === "admin" || p.admin === "superadmin")
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
