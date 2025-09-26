import seedrandom from "seedrandom";

const BOARD_SIZE = 4;
const PHASE = {
  COLOR_SELECTION: "COLOR_SELECTION",
  PLAYING: "PLAYING",
  GAME_OVER: "GAME_OVER",
};

const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const ANIMALS = ["elephant", "lion", "tiger", "leopard", "wolf", "dog", "cat", "mouse"];
const COLORS = ["red", "blue"];

const EAT_RULES = {
  elephant: ["lion", "tiger", "leopard", "wolf", "dog", "cat"],
  lion: ["tiger", "leopard", "wolf", "dog", "cat", "mouse"],
  tiger: ["leopard", "wolf", "dog", "cat", "mouse"],
  leopard: ["wolf", "dog", "cat", "mouse"],
  wolf: ["dog", "cat", "mouse"],
  dog: ["cat", "mouse"],
  cat: ["mouse"],
  mouse: ["mouse", "elephant"],
};

function clampName(name, maxLength) {
  return (name || "").toString().slice(0, maxLength);
}

function createInitialPieces(seed) {
  const rng = seedrandom(seed);
  const pieces = [];
  ANIMALS.forEach((animal) => {
    COLORS.forEach((color) => {
      pieces.push({ type: animal, color });
    });
  });

  for (let i = pieces.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  let idx = 0;
  const board = Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => {
      const piece = pieces[idx];
      idx += 1;
      return {
        id: `piece-${row}-${col}`,
        type: piece.type,
        color: piece.color,
        revealed: false,
        position: { row, col },
      };
    }),
  );
  return board;
}

function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export class DarkBeastGame {
  constructor({ seed, players }) {
    this.seed = seed;
    this.phase = PHASE.COLOR_SELECTION;
    this.turn = 1;
    this.currentColor = null;
    this.board = createInitialPieces(seed);
    this.playerOrder = players || [];
    this.playerColors = new Map(); // sessionToken -> color
    this.colorPlayers = new Map(); // color -> sessionToken
    this.moveHistory = [];
    this.consecutiveMoves = new Map();
    this.winner = null;
  }

  getPhase() {
    return this.phase;
  }

  assignPlayers(actorToken) {
    if (!this.playerOrder.includes(actorToken)) {
      this.playerOrder.push(actorToken);
    }
  }

  flipPiece({ row, col, actorToken, opponentToken }) {
    if (this.phase === PHASE.GAME_OVER) {
      throw new Error("game_over");
    }
    const cell = this.board[row]?.[col];
    if (!cell) throw new Error("invalid_cell");
    if (cell.revealed) throw new Error("already_revealed");

    cell.revealed = true;

    if (this.phase === PHASE.COLOR_SELECTION) {
      this.phase = PHASE.PLAYING;
      this.currentColor = cell.color;

      const firstPlayer = actorToken;
      const secondPlayer = opponentToken && opponentToken !== actorToken ? opponentToken : null;

      this.playerColors.set(firstPlayer, cell.color);
      this.colorPlayers.set(cell.color, firstPlayer);

      const anotherColor = cell.color === "red" ? "blue" : "red";
      if (secondPlayer) {
        this.playerColors.set(secondPlayer, anotherColor);
        this.colorPlayers.set(anotherColor, secondPlayer);
      }
    }

    this._advanceTurn();
    return this._buildActionResult({ type: "flip", row, col });
  }

  movePiece({ from, to, actorToken }) {
    if (this.phase !== PHASE.PLAYING) {
      throw new Error("not_in_playing_phase");
    }
    const actorColor = this.playerColors.get(actorToken);
    if (!actorColor) throw new Error("color_unassigned");
    if (actorColor !== this.currentColor) throw new Error("not_your_turn");

    const piece = this.board[from.row]?.[from.col];
    if (!piece || !piece.revealed) throw new Error("no_piece");
    if (piece.color !== actorColor) throw new Error("not_your_piece");

    const validMoves = this.getValidMoves(from.row, from.col);
    const isValid = validMoves.some((move) => move.row === to.row && move.col === to.col);
    if (!isValid) throw new Error("invalid_move");

    const target = this.board[to.row][to.col];
    let battleResult = null;
    if (target) {
      battleResult = this._resolveBattle(piece, target);
    }

    const moveKey = `${from.row}-${from.col}-${to.row}-${to.col}`;
    const currentCount = this.consecutiveMoves.get(moveKey) || 0;
    if (currentCount >= 2) {
      this.winner = actorColor === "red" ? "blue" : "red";
      this.phase = PHASE.GAME_OVER;
      return this._buildActionResult({
        type: "repetition_defeat",
        from,
        to,
        battleResult,
      });
    }

    if (!target) {
      this._executeMove(from, to, piece);
    } else {
      this._executeBattle(from, to, piece, target, battleResult);
    }

    this.moveHistory.push({ from, to, piece: piece.type, turn: this.turn });
    this.consecutiveMoves.clear();
    this.consecutiveMoves.set(moveKey, currentCount + 1);

    const { winner } = this._checkGameEnd();
    if (winner) {
      this.phase = PHASE.GAME_OVER;
      this.winner = winner;
    } else {
      this._advanceTurn();
    }

    return this._buildActionResult({ type: "move", from, to, battleResult });
  }

  getValidMoves(row, col) {
    const moves = [];
    const piece = this.board[row]?.[col];
    if (!piece || !piece.revealed) return moves;

    DIRECTIONS.forEach((dir) => {
      const newRow = row + dir.row;
      const newCol = col + dir.col;
      if (!isInsideBoard(newRow, newCol)) return;

      const target = this.board[newRow][newCol];
      if (!target) {
        moves.push({ row: newRow, col: newCol });
        return;
      }
      if (!target.revealed) return;
      if (target.color === piece.color) return;

      if (piece.type === target.type) {
        moves.push({ row: newRow, col: newCol });
        return;
      }
      const canEat = EAT_RULES[piece.type] || [];
      if (canEat.includes(target.type)) {
        moves.push({ row: newRow, col: newCol });
      }
    });
    return moves;
  }

  getBoardSnapshot() {
    return this.board.map((row) =>
      row.map((cell) => {
        if (!cell) return null;
        return {
          id: cell.id,
          revealed: cell.revealed,
          position: { ...cell.position },
          type: cell.revealed ? cell.type : null,
          color: cell.revealed ? cell.color : null,
        };
      }),
    );
  }

  getStateSummary() {
    return {
      phase: this.phase,
      turn: this.turn,
      currentColor: this.currentColor,
      winner: this.winner,
      board: this.getBoardSnapshot(),
      playerColors: Object.fromEntries(this.colorPlayers),
      sessionColors: Object.fromEntries(this.playerColors),
    };
  }

  assignOpponent(actorToken, opponentToken) {
    if (!this.playerColors.has(actorToken) && this.playerColors.size === 1 && opponentToken) {
      const assignedColor = [...this.playerColors.values()][0];
      const otherColor = assignedColor === "red" ? "blue" : "red";
      this.playerColors.set(opponentToken, otherColor);
      this.colorPlayers.set(otherColor, opponentToken);
    }
  }

  _advanceTurn() {
    if (this.phase === PHASE.PLAYING) {
      this.currentColor = this.currentColor === "red" ? "blue" : "red";
      this.turn += 1;
    }
  }

  _executeMove(from, to, piece) {
    this.board[to.row][to.col] = piece;
    this.board[from.row][from.col] = null;
    piece.position = { ...to };
  }

  _executeBattle(from, to, attacker, defender, result) {
    switch (result) {
      case "attacker_wins":
        this.board[to.row][to.col] = attacker;
        this.board[from.row][from.col] = null;
        attacker.position = { ...to };
        break;
      case "defender_wins":
        this.board[from.row][from.col] = null;
        break;
      case "both_die":
      default:
        this.board[from.row][from.col] = null;
        this.board[to.row][to.col] = null;
        break;
    }
  }

  _resolveBattle(attacker, defender) {
    if (attacker.type === defender.type) return "both_die";
    const attackerCanEat = EAT_RULES[attacker.type] || [];
    if (attackerCanEat.includes(defender.type)) {
      return "attacker_wins";
    }
    const defenderCanEat = EAT_RULES[defender.type] || [];
    if (defenderCanEat.includes(attacker.type)) {
      return "defender_wins";
    }
    return "defender_wins";
  }

  _checkGameEnd() {
    let redPieces = 0;
    let bluePieces = 0;
    let hasUnrevealed = false;

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const piece = this.board[row][col];
        if (!piece) continue;
        if (!piece.revealed) hasUnrevealed = true;
        if (piece.color === "red") redPieces += 1;
        else bluePieces += 1;
      }
    }

    if (redPieces === 0) {
      return { winner: "blue" };
    }
    if (bluePieces === 0) {
      return { winner: "red" };
    }

    if (hasUnrevealed) {
      return { winner: null };
    }

    const nextColor = this.currentColor === "red" ? "blue" : "red";
    if (!this._canColorMove(nextColor)) {
      return { winner: this.currentColor };
    }

    return { winner: null };
  }

  _canColorMove(color) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const piece = this.board[row][col];
        if (piece && piece.revealed && piece.color === color) {
          if (this.getValidMoves(row, col).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  _buildActionResult({ type, row, col, from, to, battleResult }) {
    return {
      type,
      row,
      col,
      from,
      to,
      battleResult,
      snapshot: this.getStateSummary(),
    };
  }
}

export function createGame({ seed, players }) {
  return new DarkBeastGame({ seed, players });
}

export function clampNickname(name) {
  return clampName(name, 16);
}
