const axios = require("axios");
const config = require("../config");

module.exports = {
  name: "gpt",
  description: "Ask a question to OpenAI's GPT, e.g. !gpt what is quantum computing?",
  async execute({ sock, jid, msg, args }) {
    const query = args.join(" ").trim();
    if (!query) {
      return sock.sendMessage(jid, { text: "Usage: !gpt <question>" }, { quoted: msg });
    }

    if (!config.OPENAI_API_KEY) {
      return sock.sendMessage(
        jid,
        {
          text:
            "⚠️ !gpt isn't set up yet. Set the OPENAI_API_KEY environment variable " +
            "(get one at https://platform.openai.com/api-keys) and restart the bot.",
        },
        { quoted: msg }
      );
    }

    try {
      const { data } = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: config.OPENAI_MODEL,
          messages: [{ role: "user", content: query }],
        },
        {
          headers: {
            Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        console.error("gpt command: unexpected OpenAI response shape:", JSON.stringify(data));
        throw new Error("Empty response from OpenAI");
      }

      await sock.sendMessage(jid, { text: answer }, { quoted: msg });
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data?.error?.message || err.response.data)}`
        : err.message;
      console.error("gpt command failed:", detail);

      let userMessage = "❌ Failed to get a response. Please try again later.";
      if (err.response?.status === 401) {
        userMessage = "❌ The configured OPENAI_API_KEY is invalid. Check your API key.";
      } else if (err.response?.status === 429) {
        userMessage = "❌ Rate limit or quota exceeded on the OpenAI account. Try again shortly, or check your billing.";
      }
      await sock.sendMessage(jid, { text: userMessage }, { quoted: msg });
    }
  },
};
