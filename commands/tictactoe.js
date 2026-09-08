// One active game per chat at a time, keyed by whatever chatId the
// calling platform passes in.
const games = new Map(); // chatId -> { board, players: { X, O }, turn }

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

function renderBoard(board) {
  const cell = (i) => board[i] || String(i + 1);
  return [
    `${cell(0)} | ${cell(1)} | ${cell(2)}`,
    "---------",
    `${cell(3)} | ${cell(4)} | ${cell(5)}`,
    "---------",
    `${cell(6)} | ${cell(7)} | ${cell(8)}`,
  ].join("\n");
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  if (board.every((c) => c)) return "draw";
  return null;
}

/** Starts a new game. The starter is X; whoever else makes the first
 * move becomes O. Returns { error } or { started, board }. */
function startGame(chatId, starterId) {
  if (games.has(chatId)) {
    return { error: "A tic-tac-toe game is already in progress. Type *!ttt stop* to end it." };
  }
  const board = Array(9).fill(null);
  games.set(chatId, { board, players: { X: starterId, O: null }, turn: "X" });
  return { started: true, board: renderBoard(board) };
}

/** Ends whatever game is running in this chat, if any. */
function stopGame(chatId) {
  const game = games.get(chatId);
  if (!game) return false;
  games.delete(chatId);
  return true;
}

/**
 * Handles a plain (non-prefixed) message that might be a move (1-9) for
 * an in-progress game in this chat. Returns true if it consumed the
 * message. `sendText` is (text) => Promise, scoped to this chat.
 */
async function handleTicTacToeMove({ chatId, senderId, text, sendText }) {
  const game = games.get(chatId);
  if (!game) return false;

  const trimmed = text.trim();
  if (!/^[1-9]$/.test(trimmed)) return false;

  const pos = parseInt(trimmed, 10) - 1;

  if (senderId === game.players.X) {
    if (game.turn !== "X") {
      await sendText("⏳ It's not your turn.");
      return true;
    }
  } else {
    if (!game.players.O) {
      game.players.O = senderId; // first different player to move claims O
    }
    if (senderId !== game.players.O) {
      await sendText("⚠️ This game already has two players.");
      return true;
    }
    if (game.turn !== "O") {
      await sendText("⏳ It's not your turn.");
      return true;
    }
  }

  if (game.board[pos]) {
    await sendText("❌ That spot's taken — pick another.");
    return true;
  }

  game.board[pos] = game.turn;
  const winner = checkWinner(game.board);

  if (winner === "draw") {
    games.delete(chatId);
    await sendText(`${renderBoard(game.board)}\n\nIt's a draw!`);
    return true;
  }
  if (winner) {
    games.delete(chatId);
    await sendText(`${renderBoard(game.board)}\n\n🎉 ${winner} wins!`);
    return true;
  }

  game.turn = game.turn === "X" ? "O" : "X";
  await sendText(`${renderBoard(game.board)}\n\n${game.turn}'s turn (type 1-9).`);
  return true;
}

module.exports = { startGame, stopGame, handleTicTacToeMove };
