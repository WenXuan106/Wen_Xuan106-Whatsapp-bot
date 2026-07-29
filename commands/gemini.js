// NOTE: these are free, unofficial community API proxies for Gemini — not
// Google's official API. No uptime/auth guarantee, and some may log
// queries. Swap in an official Gemini API key for anything that matters.
const GEMINI_PROVIDERS = [
  (q) => `https://vapis.my.id/api/gemini?q=${encodeURIComponent(q)}`,
  (q) => `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(q)}`,
  (q) => `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(q)}`,
  (q) => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(q)}`,
  (q) => `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(q)}`,
  (q) => `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(q)}`,
];

module.exports = {
  name: "gemini",
  description: "Ask Google's Gemini model a question, e.g. !gemini explain black holes",
  async execute({ sock, jid, msg, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return sock.sendMessage(jid, { text: "Usage: !gemini <question>" }, { quoted: msg });
    }

    for (const buildUrl of GEMINI_PROVIDERS) {
      const url = buildUrl(query);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`gemini provider failed (${url}): HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const answer = data.message || data.data || data.answer || data.result;
        if (answer) {
          return sock.sendMessage(jid, { text: String(answer) }, { quoted: msg });
        }
        console.error(`gemini provider returned no usable answer (${url}):`, JSON.stringify(data));
      } catch (err) {
        console.error(`gemini provider threw (${url}):`, err.message);
        continue; // try the next provider
      }
    }

    await sock.sendMessage(
      jid,
      { text: "❌ All AI providers failed. Please try again later." },
      { quoted: msg }
    );
  },
};
