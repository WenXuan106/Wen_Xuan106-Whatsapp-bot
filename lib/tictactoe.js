// One active game per group at a time, keyed by group jid. Simpler than
// tracking global cross-chat "rooms" since this bot only ever plays inside
// the group the game was started in.
const games = new Map(); // jid -> game state

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],           // diagonals
];

const EMOJI = {
  X: "❎",
  O: "⭕",
  1: "1️⃣", 2: "2️⃣", 3: "3️⃣",
  4: "4️⃣", 5: "5️⃣", 6: "6️⃣",
  7: "7️⃣", 8: "8️⃣", 9: "9️⃣",
};

function newBoard() {
  return Array(9).fill(null);
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function renderBoard(board) {
  const cells = board.map((mark, i) => EMOJI[mark || i + 1]);
  return [cells.slice(0, 3).join(""), cells.slice(3, 6).join(""), cells.slice(6, 9).join("")].join("\n");
}

function mention(jid) {
  return `@${jid.split("@")[0]}`;
}

/** Returns the existing game for this group, if any. */
function getGame(jid) {
  return games.get(jid) || null;
}

/**
 * Starts a new game. If `opponent` is given, the game starts immediately
 * with that player as O. Otherwise it opens a waiting room that anyone
 * (other than the starter) can join by running !ttt again.
 * Returns { error } or { waiting } or { started, ... }.
 */
function startGame(jid, starterId, opponentId) {
  if (games.has(jid)) {
    return { error: "A game is already in progress in this group. Type *surrender* to quit it first." };
  }

  if (opponentId) {
    if (opponentId === starterId) {
      return { error: "You can't play against yourself." };
    }
    const game = {
      board: newBoard(),
      playerX: starterId,
      playerO: opponentId,
      turn: starterId,
      state: "PLAYING",
    };
    games.set(jid, game);
    return { started: true, game };
  }

  games.set(jid, {
    board: newBoard(),
    playerX: starterId,
    playerO: null,
    turn: starterId,
    state: "WAITING",
  });
  return { waiting: true, starterId };
}

/** A second player joins an open waiting-room game. */
function joinGame(jid, joinerId) {
  const game = games.get(jid);
  if (!game || game.state !== "WAITING") return { error: "No open game to join. Start one with !ttt" };
  if (joinerId === game.playerX) return { error: "You already started this game — wait for someone else to join." };

  game.playerO = joinerId;
  game.state = "PLAYING";
  return { started: true, game };
}

/**
 * Handles a plain (non-prefixed) message that might be a move or a
 * surrender for an in-progress game in this group. Returns true if it
 * consumed the message.
 */
async function handleTicTacToeMove({ sock, jid, senderId, text }) {
  const game = games.get(jid);
  if (!game || game.state !== "PLAYING") return false;
  if (![game.playerX, game.playerO].includes(senderId)) return false;

  const isSurrender = /^(surrender|give up)$/i.test(text.trim());
  const isMove = /^[1-9]$/.test(text.trim());
  if (!isSurrender && !isMove) return false;

  if (isSurrender) {
    const winner = senderId === game.playerX ? game.playerO : game.playerX;
    games.delete(jid);
    await sock.sendMessage(jid, {
      text: `🏳️ ${mention(senderId)} surrendered! ${mention(winner)} wins the game!`,
      mentions: [senderId, winner],
    });
    return true;
  }

  if (senderId !== game.turn) {
    await sock.sendMessage(jid, { text: "❌ Not your turn!" });
    return true;
  }

  const index = parseInt(text.trim(), 10) - 1;
  if (game.board[index]) {
    await sock.sendMessage(jid, { text: "❌ That spot is already taken." });
    return true;
  }

  const mark = senderId === game.playerX ? "X" : "O";
  game.board[index] = mark;

  const winner = checkWinner(game.board);
  const isTie = !winner && game.board.every((c) => c !== null);
  game.turn = senderId === game.playerX ? game.playerO : game.playerX;

  let status;
  if (winner) {
    const winnerId = winner === "X" ? game.playerX : game.playerO;
    status = `🎉 ${mention(winnerId)} wins the game!`;
  } else if (isTie) {
    status = "🤝 Game ended in a draw!";
  } else {
    status = `🎲 Turn: ${mention(game.turn)} (${game.turn === game.playerX ? "❎" : "⭕"})`;
  }

  const lines = [
    "🎮 *TicTacToe*",
    status,
    "",
    renderBoard(game.board),
    "",
    `▢ ❎ ${mention(game.playerX)}`,
    `▢ ⭕ ${mention(game.playerO)}`,
  ];
  if (!winner && !isTie) {
    lines.push("", "Type a number (1-9) to move, or *surrender* to give up.");
  }

  await sock.sendMessage(jid, {
    text: lines.join("\n"),
    mentions: [game.playerX, game.playerO],
  });

  if (winner || isTie) games.delete(jid);
  return true;
}

module.exports = { getGame, startGame, joinGame, renderBoard, handleTicTacToeMove, mention };
