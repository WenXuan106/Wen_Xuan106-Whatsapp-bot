const config = require("../config");

module.exports = {
  name: "weather",
  description: "Get the current weather for a city, e.g. !weather Singapore",
  async execute({ sock, msg, jid, args }) {
    const city = args.join(" ").trim();
    if (!city) {
      return sock.sendMessage(jid, { text: "Usage: !weather <city>" }, { quoted: msg });
    }

    if (!config.OPENWEATHER_API_KEY) {
      return sock.sendMessage(
        jid,
        { text: "❌ Weather isn't configured — ask the bot owner to set OPENWEATHER_API_KEY." },
        { quoted: msg }
      );
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        city
      )}&appid=${config.OPENWEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const text =
          res.status === 404
            ? `❌ Couldn't find a city called "${city}".`
            : `❌ Weather lookup failed: ${data.message || res.status}`;
        return sock.sendMessage(jid, { text }, { quoted: msg });
      }

      const description = data.weather?.[0]?.description || "unknown conditions";
      const temp = data.main?.temp;
      const feelsLike = data.main?.feels_like;
      const humidity = data.main?.humidity;

      const lines = [
        `🌤️ Weather in ${data.name}${data.sys?.country ? `, ${data.sys.country}` : ""}`,
        `${description.charAt(0).toUpperCase()}${description.slice(1)}`,
        `🌡️ Temperature: ${temp}°C (feels like ${feelsLike}°C)`,
      ];
      if (humidity !== undefined) lines.push(`💧 Humidity: ${humidity}%`);

      await sock.sendMessage(jid, { text: lines.join("\n") }, { quoted: msg });
    } catch (err) {
      console.error("Error fetching weather:", err);
      await sock.sendMessage(
        jid,
        { text: "❌ Sorry, I couldn't fetch the weather right now." },
        { quoted: msg }
      );
    }
  },
};
