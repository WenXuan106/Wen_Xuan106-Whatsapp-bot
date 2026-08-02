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
 * Given a JID pulled from a mention or a quoted message, finds the exact
 * `id` string for that person in the group's own participant list.
 * WhatsApp's group actions (remove/promote/demote) silently do nothing
 * when handed a JID in the "wrong" form for that group (e.g. a
 * @s.whatsapp.net JID when the group tracks that member as a @lid, or
 * vice versa) — no error, it just doesn't happen. Passing back the
 * participant's own `id` guarantees the format WhatsApp expects.
 * Falls back to the original candidate if no match is found, so the
 * caller still gets a reasonable error from WhatsApp's API instead of
 * this silently swallowing an unresolvable target.
 */
async function resolveParticipantId(sock, participants, candidateJid) {
  const candidates = await withAltJids(sock, [candidateJid]);
  const match = participants.find((p) => matchesAny(p.id, candidates));
  return match ? match.id : candidateJid;
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
 *
 * For messages the bot's own account sent (fromMe), Baileys typically
 * omits `key.participant` entirely — there's no need for it to name the
 * sender when the sender is obviously "us". Without a fallback here,
 * this used to leave `remoteJid` (the group's own JID) as the only
 * candidate, which never matches a participant and made every admin
 * command sent by the bot's own (self-bot) account report "not an
 * admin" even when it was one. Fall back to the bot's own identity in
 * that case instead.
 */
function getSenderCandidates(msg, sock) {
  if (msg.key.participant) {
    return [msg.key.participant, msg.key.participantAlt].filter(Boolean);
  }
  if (msg.key.fromMe) {
    return [sock?.user?.id, sock?.authState?.creds?.me?.lid].filter(Boolean);
  }
  return [msg.key.remoteJid].filter(Boolean);
}

/**
 * Actively asks Baileys' own identity-mapping store for the alternate
 * form of a JID (lid -> phone-number JID, or the reverse). This exists
 * because `key.participantAlt` is only populated when Baileys already
 * happens to know the mapping for that specific person — which in
 * practice is reliable for the bot's own account, but frequently just
 * isn't known yet for other group members, especially ones the bot
 * hasn't interacted with much. Querying the store directly catches
 * mappings Baileys has learned but didn't happen to attach to this
 * particular message. Safe to call on any Baileys version — if the
 * store or its methods don't exist, this just returns null.
 */
async function getAltJid(sock, jid) {
  if (!jid) return null;
  try {
    const store = sock.signalRepository?.lidMapping;
    if (!store) return null;
    if (jid.endsWith("@lid") && typeof store.getPNForLID === "function") {
      return (await store.getPNForLID(jid)) || null;
    }
    if (!jid.endsWith("@lid") && typeof store.getLIDForPN === "function") {
      return (await store.getLIDForPN(jid)) || null;
    }
  } catch (_) {
    // Lookup failed — fall back to whatever candidates we already have.
  }
  return null;
}

/**
 * Expands a list of candidate JIDs with whatever alternate forms
 * Baileys' mapping store knows about, so a person only known by one ID
 * form can still be matched against a participant list keyed by the
 * other form.
 */
async function withAltJids(sock, candidates) {
  const alts = await Promise.all(candidates.map((c) => getAltJid(sock, c)));
  return [...candidates, ...alts.filter(Boolean)];
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

  const senderCandidates = await withAltJids(sock, getSenderCandidates(msg, sock));
  // The bot's own identity can likewise show up as either form depending
  // on the group, so check both known forms of "us" too.
  const botCandidates = await withAltJids(
    sock,
    [sock.user?.id, sock.authState?.creds?.me?.lid].filter(Boolean)
  );

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

/**
 * True if `msg` was sent by the bot owner — either the account the bot
 * itself is paired to (fromMe, e.g. commanding it from your own DM/self-
 * chat), or a number matching config.OWNER_NUMBER (digits-only, with
 * country code, no "+") for cases where the bot should also take owner
 * commands from a separate personal number.
 */
function isOwner(msg, config) {
  if (msg.key.fromMe) return true;
  if (!config?.OWNER_NUMBER) return false;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split("@")[0].split(":")[0];
  return senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g, "");
}

module.exports = { getGroupAdminStatus, getMentionedJid, getQuotedParticipant, resolveParticipantId, isOwner };
