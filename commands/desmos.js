const { Resvg } = require("@resvg/resvg-js");
const config = require("../config");
const { parseGraphRequest, buildGraphSvg, summarise } = require("../lib/graphcard");

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
  "Big drawings (thousands of lines) don't fit in one chat message — save them in a .txt file and send it as a document with the caption !desmos (or reply to the file with !desmos). Up to 8 MB.",
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
    // A .txt file sent with !desmos (or replied to with !desmos) is read too — it can be far longer than a chat message.
    let fileText = null;
    try {
      fileText = ctx.getDocumentText ? await ctx.getDocumentText() : null;
    } catch (err) {
      return ctx.sendText(`❌ ${err.message}`);
    }
    if (fileText && fileText.length > 300000) {
      await ctx.sendText("⏳ That's a big one — drawing it now, this can take a few seconds…");
    }

    // Replying to a message with !desmos graphs that message.
    const typed = requestText(ctx);
    const input = fileText ? `${typed}\n${fileText}`.trim() : typed || String(ctx.quotedText || "").trim();
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
      const notes = [];
      const info = summarise(request);
      if (info.shapes > 1 && info.bounds) {
        const r = (n) => Math.round(n);
        notes.push(
          `📐 Read ${info.items} lines (${Math.round(input.length / 1000)}k characters${fileText ? ", from the file" : ""}). They cover x ${r(info.bounds.x[0])}–${r(info.bounds.x[1])} and y ${r(info.bounds.y[0])}–${r(info.bounds.y[1])}.`
        );
      }
      if (request.repaired?.length) {
        const n = request.repaired.length;
        notes.push(
          `ℹ️ ${n === 1 ? "A line was" : `${n} lines were`} cut off (item ${request.repaired.slice(0, 5).join(", ")}${n > 5 ? ", …" : ""}), so I finished ${n === 1 ? "it" : "them"} by repeating the last number. ${n === 1 ? "It" : "They"} may look slightly off.`
        );
      }
      if (request.skipped?.length) {
        const n = request.skipped.length;
        notes.push(
          `⚠️ Skipped ${n} line${n === 1 ? "" : "s"} I couldn't read:\n${request.skipped.slice(0, 2).join("\n")}${n > 2 ? `\n…and ${n - 2} more` : ""}`
        );
      }
      let caption = notes.join("\n\n") || undefined;
      if (caption && caption.length > 900) caption = caption.slice(0, 897) + "…";
      await ctx.sendImage(png, caption);
    } catch (err) {
      console.error("desmos command failed:", err.message);
      await ctx.sendText("❌ Something went wrong drawing that graph.");
    }
  },
};
