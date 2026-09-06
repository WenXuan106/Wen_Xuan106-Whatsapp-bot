const CHOICES = ["rock", "paper", "scissors"];
const EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

function decideWinner(user, bot) {
  if (user === bot) return "draw";
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[user] === bot ? "user" : "bot";
}

module.exports = {
  name: "rps",
  description: "Play rock-paper-scissors, e.g. !rps rock",
  async execute(ctx) {
    const choice = (ctx.args[0] || "").toLowerCase();
    if (!CHOICES.includes(choice)) {
      return ctx.sendText("Usage: !rps <rock|paper|scissors>");
    }
    const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    const winner = decideWinner(choice, botChoice);
    const resultText = winner === "draw" ? "It's a draw!" : winner === "user" ? "You win!" : "I win!";
    await ctx.sendText(`You: ${EMOJI[choice]} ${choice}\nMe: ${EMOJI[botChoice]} ${botChoice}\n\n${resultText}`);
  },
};
