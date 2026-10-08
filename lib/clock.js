const config = require("../config");

// The current date and time, written the way it's shown at the top of !ping
// and !help. It always reads the clock at the moment it's called — never a
// saved or message timestamp — so it's exactly "now" when someone uses the bot.
//
// The time zone comes from TIMEZONE in config.js (a name like "Asia/Singapore"
// or "Europe/London"). A name that isn't valid falls back to UTC.

let zone = null;

function getZone() {
  if (zone) return zone;
  const wanted = config.TIMEZONE || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: wanted });
    zone = wanted;
  } catch (_) {
    console.error(`TIMEZONE "${wanted}" isn't a valid time zone name — using UTC instead.`);
    zone = "UTC";
  }
  return zone;
}

/**
 * Returns { date, time } for the current moment, e.g.
 *   { date: "Fri, 9 Oct 2026", time: "3:45:12 PM (GMT+8)" }
 * Pass { seconds: false } to leave the seconds out ("3:45 PM (GMT+8)").
 * `at` is only for testing — leave it out to get the real current time.
 */
function now({ seconds = true, at = new Date() } = {}) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getZone(),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(at);

  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
  const clock = seconds ? `${get("hour")}:${get("minute")}:${get("second")}` : `${get("hour")}:${get("minute")}`;

  return {
    date: `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`,
    time: `${clock} ${get("dayPeriod")} (${get("timeZoneName")})`,
  };
}

module.exports = { now };
