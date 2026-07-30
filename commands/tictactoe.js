const { getGame, startGame, joinGame, renderBoard, mention } = require("../lib/tictactoe");
const { getMentionedJid } = require("../lib/admin");

module.exports = {
  name: "ttt",
  description: "Play tic-tac-toe, e.g. !ttt @user (or !ttt to open a game anyone can join)",
  async execute({ sock, jid, msg }) {
    if (!jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, { text: "This command only works in groups." });
    }

    const senderId = msg.key.participant || msg.key.remoteJid;
    const opponent = getMentionedJid(msg);

    // If there's already an open waiting-room game, treat this as a join.
    const existing = getGame(jid);
    if (existing && existing.state === "WAITING") {
      const result = joinGame(jid, senderId);
      if (result.error) {
        return sock.sendMessage(jid, { text: result.error });
      }
      return sendGameStarted(sock, jid, result.game);
    }

    const result = startGame(jid, senderId, opponent);
    if (result.error) {
      return sock.sendMessage(jid, { text: result.error });
    }
    if (result.waiting) {
      return sock.sendMessage(jid, {
        text: `⏳ ${mention(senderId)} started a TicTacToe game!\nAnyone type *!ttt* to join.`,
        mentions: [senderId],
      });
    }
    return sendGameStarted(sock, jid, result.game);
  },
};

async function sendGameStarted(sock, jid, game) {
  const lines = [
    "🎮 *TicTacToe Game Started!*",
    `Turn: ${mention(game.turn)} (❎)`,
    "",
    renderBoard(game.board),
    "",
    `▢ ❎ ${mention(game.playerX)}`,
    `▢ ⭕ ${mention(game.playerO)}`,
    "",
    "Type a number (1-9) to place your symbol. Type *surrender* to give up.",
  ];
  await sock.sendMessage(jid, {
    text: lines.join("\n"),
    mentions: [game.playerX, game.playerO],
  });
}
