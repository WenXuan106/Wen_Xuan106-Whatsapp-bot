const { Resvg } = require("@resvg/resvg-js");
const { parseGraphRequest, buildGraphSvg } = require("../lib/graphcard");

const USAGE = [
  "📈 *Desmos graph*",
  "",
  "Usage: !desmos <function>",
  "",
  "Examples:",
  "• !desmos x^2",
  "• !desmos y = sin(x)",
  "• !desmos x^2; 2x+1; sqrt(x)   (up to 6, separated by ; or ,)",
  "• !desmos tan(x) x:-6.28..6.28 y:-5..5   (set the window)",
  "",
  "You can use + - * / ^, brackets, pi, e and sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log exp floor ceil round sign.",
].join("\n");

module.exports = {
  name: "desmos",
  aliases: ["graph", "plot"],
  description: "Graph one or more functions of x as an image, e.g. !desmos x^2; sin(x)",
  async execute(ctx) {
    const input = ctx.args.join(" ").trim();
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
