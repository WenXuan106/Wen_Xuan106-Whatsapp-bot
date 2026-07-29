const axios = require("axios");

module.exports = {
  name: "gpt",
  description: "Ask a question to a GPT-style AI, e.g. !gpt what is quantum computing?",
  async execute({ sock, jid, msg, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return sock.sendMessage(jid, { text: "Usage: !gpt <question>" }, { quoted: msg });
    }

    try {
      // NOTE: this hits a free, unofficial community API proxy — not
      // OpenAI directly. No uptime guarantee. Swap for an official API
      // key if you need this to be reliable.
      const { data } = await axios.get("https://zellapi.autos/ai/chatbot", {
        params: { text: query },
        timeout: 20000,
      });

      if (!data?.status || !data?.result) throw new Error("Invalid response from AI API");
      await sock.sendMessage(jid, { text: data.result }, { quoted: msg });
    } catch (err) {
      console.error("gpt command failed:", err.message);
      await sock.sendMessage(
        jid,
        { text: "❌ Failed to get a response. Please try again later." },
        { quoted: msg }
      );
    }
  },
};
