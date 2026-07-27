const OPTIONS = ["rock", "paper", "scissors"];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

module.exports = {
  name: "rps",
  description: "Play rock-paper-scissors, e.g. !rps rock",
  async execute({ sock, jid, msg, args }) {
    const choice = args[0]?.toLowerCase();
    if (!OPTIONS.includes(choice)) {
      return sock.sendMessage(jid, { text: "Usage: !rps rock | paper | scissors" });
    }

    const botChoice = OPTIONS[Math.floor(Math.random() * 3)];
    let result;
    if (botChoice === choice) result = "It's a tie!";
    else if (BEATS[choice] === botChoice) result = "You win!";
    else result = "I win!";

    await sock.sendMessage(
      jid,
      { text: `You: ${choice}\nMe: ${botChoice}\n\n${result}` },
      { quoted: msg }
    );
  },
};
