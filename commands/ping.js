const config = require("../config");

function performanceRating(ms) {
  if (ms < 300) return { dot: "🟢", label: "Excellent" };
  if (ms < 800) return { dot: "🟢", label: "Fast" };
  if (ms < 2000) return { dot: "🟡", label: "Moderate" };
  return { dot: "🔴", label: "Very Slow" };
}

module.exports = {
  name: "ping",
  description: "Check that the bot is alive and see response time",
  async execute(ctx) {
    // Real latency: time between the platform delivering the message and
    // the bot getting around to replying.
    const sentAt = ctx.messageTimestampMs ?? Date.now();
    const ms = Math.max(0, Date.now() - sentAt);
    const perf = performanceRating(ms);
    const divider = "―――――――――――――――";

    const lines = [
      `🏓 *${config.BOT_NAME}*`,
      divider,
      "",
      `🔥 *${config.BOT_NAME} is online.*`,
      "",
      `⚡ *Response Time:*`,
      `${ms}ms`,
      "",
      `📊 *Performance:*`,
      `${perf.dot} ${perf.label}`,
      "",
      divider,
      "",
      `📢 *Stay updated:*`,
      `https://whatsapp.com/channel/0029VbBbyJO2v1IxySsZL72i`,
      "",
      divider,
      "",
      `🚀 Systems operational.`,
    ];

    await ctx.sendText(lines.join("\n"));
  },
};
