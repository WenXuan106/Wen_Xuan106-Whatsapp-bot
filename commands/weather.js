const config = require("../config");
const { find: findTimeZone } = require("geo-tz");

// Julian-date-based lunar phase calculation (public-domain formula,
// accurate to within a few hours) — verified against confirmed real
// moon phase dates rather than a simpler fixed-epoch approximation,
// which drifted by about a day after 26 years and misclassified phases.
function moonPhase(date = new Date()) {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  const day = date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60) / 24;

  if (month < 3) {
    year--;
    month += 12;
  }
  month++;
  const c = 365.25 * year;
  const e = 30.6 * month;
  let jd = c + e + day - 694039.09;
  jd /= 29.5305882; // divide by the moon cycle length
  let b = Math.trunc(jd);
  jd -= b; // fractional part of the cycle
  b = Math.round(jd * 8) % 8; // scale to 0-7, 8 wraps back to 0 (New Moon)

  const phases = [
    { name: "New Moon", emoji: "🌑" },
    { name: "Waxing Crescent", emoji: "🌒" },
    { name: "First Quarter", emoji: "🌓" },
    { name: "Waxing Gibbous", emoji: "🌔" },
    { name: "Full Moon", emoji: "🌕" },
    { name: "Waning Gibbous", emoji: "🌖" },
    { name: "Last Quarter", emoji: "🌗" },
    { name: "Waning Crescent", emoji: "🌘" },
  ];
  return phases[b];
}

function weatherEmoji(main) {
  const map = {
    Clear: "☀️",
    Clouds: "☁️",
    Rain: "🌧️",
    Drizzle: "🌦️",
    Thunderstorm: "⛈️",
    Snow: "❄️",
    Mist: "🌫️",
    Fog: "🌫️",
    Haze: "🌫️",
    Smoke: "🌫️",
    Dust: "🌫️",
    Tornado: "🌪️",
  };
  return map[main] || "🌡️";
}

function formatTime(unixSeconds, timeZone) {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function dayLabel(date, index, timeZone) {
  if (index === 0) return "Today";
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone });
}

module.exports = {
  name: "weather",
  description: "Get a detailed weather report + 3-day outlook for a city, e.g. !weather Tokyo",
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
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        city
      )}&appid=${config.OPENWEATHER_API_KEY}&units=metric`;
      const currentRes = await fetch(currentUrl);
      const current = await currentRes.json();

      if (!currentRes.ok) {
        const text =
          currentRes.status === 404
            ? `❌ Couldn't find a city called "${city}".`
            : `❌ Weather lookup failed: ${current.message || currentRes.status}`;
        return sock.sendMessage(jid, { text }, { quoted: msg });
      }

      const { lat, lon } = current.coord || {};
      let timeZone;
      try {
        timeZone = lat != null && lon != null ? findTimeZone(lat, lon)[0] : undefined;
      } catch (_) {
        timeZone = undefined; // fall back to UTC formatting below rather than fail the whole command
      }

      // Same free-tier API key covers the 5-day/3-hour forecast endpoint —
      // used here just for a 3-day outlook. If it fails, still show the
      // current conditions rather than failing the whole command.
      let outlookDays = [];
      try {
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
          city
        )}&appid=${config.OPENWEATHER_API_KEY}&units=metric`;
        const forecastRes = await fetch(forecastUrl);
        if (forecastRes.ok) {
          const forecast = await forecastRes.json();
          const days = new Map();
          for (const entry of forecast.list || []) {
            const date = new Date(entry.dt * 1000);
            const key = date.toLocaleDateString("en-CA", { timeZone }); // YYYY-MM-DD, sortable
            if (!days.has(key)) days.set(key, { date, temps: [], pops: [], descriptions: {} });
            const day = days.get(key);
            day.temps.push(entry.main.temp);
            day.pops.push(entry.pop ?? 0);
            const desc = entry.weather?.[0]?.main || "Clear";
            day.descriptions[desc] = (day.descriptions[desc] || 0) + 1;
          }

          const todayKey = new Date().toLocaleDateString("en-CA", { timeZone });
          outlookDays = [...days.entries()]
            .filter(([key]) => key >= todayKey)
            .slice(0, 3)
            .map(([, day], index) => {
              const dominant = Object.entries(day.descriptions).sort((a, b) => b[1] - a[1])[0][0];
              return {
                label: dayLabel(day.date, index, timeZone),
                emoji: weatherEmoji(dominant),
                min: Math.round(Math.min(...day.temps)),
                max: Math.round(Math.max(...day.temps)),
                pop: Math.round(Math.max(...day.pops) * 100),
              };
            });
        }
      } catch (err) {
        console.error("weather: forecast fetch failed, continuing without outlook:", err.message);
      }

      const moon = moonPhase();
      const mainCondition = current.weather?.[0]?.main;
      const emoji = weatherEmoji(mainCondition);
      const description = current.weather?.[0]?.description || "unknown conditions";
      const windKmh =
        current.wind?.speed != null ? Math.round(current.wind.speed * 3.6 * 10) / 10 : null;

      const lines = [
        `${emoji} *${config.BOT_NAME} Weather Report*`,
        "―――――――――――――――",
        "",
        `📍 *Location:* ${current.name}${current.sys?.country ? `, ${current.sys.country}` : ""}`,
        timeZone ? `🌐 *Time Zone:* ${timeZone}` : null,
        `${emoji} *Conditions:* ${description.charAt(0).toUpperCase()}${description.slice(1)}`,
        `🌡️ *Temperature:* ${current.main.temp}°C (feels like ${current.main.feels_like}°C)`,
        `💧 *Humidity:* ${current.main.humidity}%`,
        windKmh != null ? `💨 *Wind:* ${windKmh} km/h` : null,
        current.main.pressure ? `🧭 *Pressure:* ${current.main.pressure} hPa` : null,
        current.sys?.sunrise ? `🌅 *Sunrise:* ${formatTime(current.sys.sunrise, timeZone)}` : null,
        current.sys?.sunset ? `🌇 *Sunset:* ${formatTime(current.sys.sunset, timeZone)}` : null,
        `${moon.emoji} *Lunar Phase:* ${moon.name}`,
      ].filter(Boolean);

      if (outlookDays.length) {
        lines.push("", "―――――――――――――――", "*3-Day Outlook*");
        for (const day of outlookDays) {
          lines.push("", `📅 *${day.label}*`, `${day.emoji} ${day.min}°C – ${day.max}°C`, `☔ Rain chance: ${day.pop}%`);
        }
      }

      lines.push("", "―――――――――――――――", `🛰️ Powered by ${config.BOT_NAME}`);

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
