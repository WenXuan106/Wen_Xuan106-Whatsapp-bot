// Add new lines here any time — just add another string to this array,
// one sentence per entry. No other code needs to change.
const SENTENCES = [
  "WOI WOI WOI",
  "START POSTING",
  "RAYDEN ANGRY AH",
  "EH",
  "I CAME ALL THE WAY FROM CHINA ON TWO BICYCLE WHEEL TO SEE THIS",
  "🏞️ IS THIS A PARK OR A PLAYGROUND??",
  "AYD!!!",
];

module.exports = {
  name: "ash",
  description: "Says something random",
  async execute(ctx) {
    const line = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    await ctx.sendText(line);
  },
};
