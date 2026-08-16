// Shared "active question" store used by every !<category> quiz command
// (trivia, geography, science, ...) plus !answer. One active question per
// chat at a time, regardless of which category started it — matches how
// !trivia + !answer already behaved before geography/science existed.
const active = new Map(); // jid -> { answers: string[], category: string }

/** Starts a question for this chat. `answers` can be one string or an
 * array of acceptable answers (e.g. ["vatican", "vatican city"]). */
function startQuestion(jid, answers, category) {
  const list = (Array.isArray(answers) ? answers : [answers]).map((a) => a.toLowerCase().trim());
  active.set(jid, { answers: list, category });
}

function getActive(jid) {
  return active.get(jid);
}

function clearActive(jid) {
  active.delete(jid);
}

module.exports = { startQuestion, getActive, clearActive };
