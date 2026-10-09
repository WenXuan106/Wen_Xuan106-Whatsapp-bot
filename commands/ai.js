const axios = require("axios");
const config = require("../config");

// !ai — a free AI chat.
//   1. Groq (official, free tier, fast Llama models) when GROQ_API_KEY is set.
//   2. Otherwise, or if Groq fails, a keyless community service (Pollinations).
//      It needs no signup but is best-effort: it can be slow or go away.
// Both speak the OpenAI "chat completions" format, so one parser handles both.

const SYSTEM_PROMPT =
  "You are a helpful assistant inside a WhatsApp/Telegram chat. Answer clearly and briefly " +
  "(under about 1500 characters). Use plain text — no markdown tables or headings.";

const MAX_QUESTION_CHARS = 2000;
const MAX_QUOTED_CHARS = 3000;
const MESSAGE_CHUNK = 3500; // Telegram refuses messages over 4096 characters

// Each provider returns the answer text or throws. `err.kind` explains why.
const PROVIDERS = [
  {
    name: "Groq",
    enabled: () => Boolean(config.GROQ_API_KEY),
    ask: (messages) =>
      chatCompletion("https://api.groq.com/openai/v1/chat/completions", messages, {
        headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
        body: { model: config.GROQ_MODEL },
      }),
  },
  {
    name: "Pollinations",
    enabled: () => true,
    ask: (messages) =>
      chatCompletion("https://text.pollinations.ai/openai", messages, {
        body: { model: "openai", private: true },
      }),
  },
];

async function chatCompletion(url, messages, { headers = {}, body = {} } = {}) {
  let data;
  try {
    ({ data } = await axios.post(
      url,
      { ...body, messages, max_tokens: 700, temperature: 0.7 },
      { headers: { "Content-Type": "application/json", ...headers }, timeout: 30000 }
    ));
  } catch (err) {
    const status = err.response && err.response.status;
    const detail = err.response ? JSON.stringify(err.response.data).slice(0, 300) : err.message;
    const wrapped = new Error(status ? `HTTP ${status}: ${detail}` : detail);
    wrapped.status = status;
    wrapped.detail = detail;
    throw wrapped;
  }

  const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof answer !== "string" || !answer.trim()) {
    const empty = new Error("empty answer");
    empty.status = 0;
    throw empty;
  }
  return answer.trim();
}

// Splits a long answer into message-sized pieces, preferring paragraph, then line, then space breaks.
function splitMessage(text, limit = MESSAGE_CHUNK) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = Math.max(rest.lastIndexOf("\n\n", limit), rest.lastIndexOf("\n", limit), rest.lastIndexOf(" ", limit));
    if (cut < limit * 0.5) cut = limit; // no good break point in the second half — cut hard
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

// What to tell the person when every provider failed.
function failureMessage(failures) {
  const keyed = failures.find((f) => f.provider === "Groq");
  if (keyed && keyed.err.status === 401) {
    return "❌ The GROQ_API_KEY is invalid. The bot owner needs to check it at https://console.groq.com/keys";
  }
  if (keyed && (keyed.err.status === 404 || (keyed.err.status === 400 && /model/i.test(keyed.err.detail || "")))) {
    return "❌ Groq doesn't offer the configured model any more. The bot owner needs to set GROQ_MODEL to a current one.";
  }
  if (failures.some((f) => f.err.status === 429)) {
    return "⏳ The free AI is busy (rate limit reached). Try again in a minute.";
  }
  if (!config.GROQ_API_KEY) {
    return "❌ The free AI service didn't answer. The bot owner can make !ai reliable by setting a free GROQ_API_KEY (console.groq.com/keys).";
  }
  return "❌ The AI didn't answer. Please try again in a moment.";
}

module.exports = {
  name: "ai",
  description: "Free AI chat, e.g. !ai explain black holes — or reply to a message with !ai summarize this",
  async execute(ctx) {
    const question = ctx.args.join(" ").trim().slice(0, MAX_QUESTION_CHARS);
    const quoted = (ctx.quotedText || "").trim().slice(0, MAX_QUOTED_CHARS);

    if (!question && !quoted) {
      return ctx.sendText("Usage: !ai <question>\nOr reply to a message with !ai to ask about it (e.g. !ai summarize this).");
    }

    const userContent = quoted
      ? `Here is a message from the chat:\n"""\n${quoted}\n"""\n\n${question || "Explain or respond to this message."}`
      : question;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    const failures = [];
    for (const provider of PROVIDERS) {
      if (!provider.enabled()) continue;
      try {
        const answer = await provider.ask(messages);
        for (const part of splitMessage(answer)) await ctx.sendText(part);
        return;
      } catch (err) {
        console.error(`ai command: ${provider.name} failed — ${err.message}`);
        failures.push({ provider: provider.name, err });
      }
    }

    await ctx.sendText(failureMessage(failures));
  },
  // exposed for tests
  _splitMessage: splitMessage,
};
