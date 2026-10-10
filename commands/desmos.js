const { Resvg } = require("@resvg/resvg-js");
const config = require("../config");
const { parseGraphRequest, buildGraphSvg } = require("../lib/graphcard");

const USAGE = [
  "📈 *Desmos graph*",
  "",
  "Usage: !desmos <function>",
  "",
  "Examples:",
  "• !desmos x^2",
  "• !desmos y = sin(x)",
  "• !desmos x^2; 2x+1; sqrt(x)   (separate with ; or , or new lines)",
  "• !desmos tan(x) x:-6.28..6.28 y:-5..5   (set the window)",
  "• !desmos x^2+y^2=25   (circles and other equations in x and y)",
  "• !desmos a=2; b=3; y=a*sin(b*x)   (define values, then use them)",
  "",
  "You can also paste lines copied from Desmos (LaTeX), like:",
  "x=733\\left\\{6\\le y\\le 8\\right\\}",
  "\\left(((1-t)^{3}\\cdot 5+3(1-t)^{2}t\\cdot 6),((1-t)^{3}\\cdot 9+t^{3}\\cdot 2)\\right)",
  "…or reply to a message that contains them with !desmos. The picture zooms to fit.",
  "",
  "Math: + - * / ^, brackets, pi, e, sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log exp floor ceil round sign.",
].join("\n");

/**
 * The text after "!desmos". Uses the original message text (so new lines are
 * kept — one line per equation) and falls back to the split-up arguments.
 */
function requestText(ctx) {
  const raw = String(ctx.text || "");
  if (raw.startsWith(config.PREFIX)) {
    const afterPrefix = raw.slice(config.PREFIX.length);
    const match = /^\S+/.exec(afterPrefix);
    if (match) return afterPrefix.slice(match[0].length).trim();
  }
  return ctx.args.join(" ").trim();
}

module.exports = {
  name: "desmos",
  aliases: ["graph", "plot"],
  description: "Graph functions, lines and curves as an image, e.g. !desmos x^2; sin(x)",
  async execute(ctx) {
    // Replying to a message with !desmos graphs that message.
    const input = requestText(ctx) || String(ctx.quotedText || "").trim();
    if (!input) {
      return ctx.sendText(USAGE);
    }

    let request;
    try {
      request = parseGraphRequest(input);
    } catch (err) {
      return ctx.sendText(`❌ ${err.message}\n\nTry: !desmos x^2`);
    }

    try {
      const svg = buildGraphSvg(request);
      const resvg = new Resvg(svg, { font: { loadSystemFonts: true } });
      const png = resvg.render().asPng();
      await ctx.sendImage(png);
    } catch (err) {
      console.error("desmos command failed:", err.message);
      await ctx.sendText("❌ Something went wrong drawing that graph.");
    }
  },
};
