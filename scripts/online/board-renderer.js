const BOARD_SIZE = 4;

const DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

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

function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export class RemoteBoardRenderer {
  constructor({ boardElement, onFlip, onMove, messageSink }) {
    this.boardElement = boardElement;
    this.onFlip = onFlip;
    this.onMove = onMove;
    this.messageSink = messageSink || (() => {});
    this.snapshot = null;
    this.sessionToken = null;
    this.selectedCell = null;
    this.highlightedCells = [];
    this.mode = "idle";
  }

  setSessionToken(token) {
    this.sessionToken = token;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== "online") {
      this.clearSelection();
    }
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot;
    this.render();
  }

  resetBoard(snapshot) {
    this.snapshot = snapshot || null;
    this.clearSelection();
    this.render();
  }

  render() {
    if (!this.snapshot || this.mode !== "online") {
      return;
    }
    const board = this.snapshot.board;
    this.boardElement.innerHTML = "";

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const cell = document.createElement("div");
        cell.className = "board-cell";
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.addEventListener("click", () => this.handleCellClick(row, col));

        const piece = board[row]?.[col];
        if (piece) {
          const pieceElement = document.createElement("div");
          pieceElement.className = "piece";
          pieceElement.dataset.id = piece.id;
          if (piece.revealed) {
            pieceElement.dataset.type = piece.type;
            pieceElement.dataset.color = piece.color;
            pieceElement.classList.add(piece.color);
            pieceElement.classList.add(`piece-${piece.type}`);
          } else {
            pieceElement.classList.add("hidden");
          }
          cell.appendChild(pieceElement);
        }

        this.boardElement.appendChild(cell);
      }
    }
    this.applySelectionHighlight();
  }

  handleCellClick(row, col) {
    if (!this.snapshot || this.mode !== "online") return;
    const phase = this.snapshot.phase;
    const board = this.snapshot.board;
    const piece = board[row]?.[col];
    const localColor = this.getLocalColor();

    if (phase === "COLOR_SELECTION") {
      if (piece && !piece.revealed) {
        this.onFlip({ row, col });
      }
      return;
    }

    if (phase !== "PLAYING") {
      return;
    }

    if (piece && !piece.revealed) {
      this.onFlip({ row, col });
      return;
    }

    if (!this.selectedCell) {
      if (piece && piece.revealed && piece.color === localColor) {
        this.selectCell(row, col);
      }
      return;
    }

    const { row: fromRow, col: fromCol } = this.selectedCell;
    if (fromRow === row && fromCol === col) {
      this.clearSelection();
      return;
    }

    this.onMove({ from: { row: fromRow, col: fromCol }, to: { row, col } });
    this.clearSelection();
  }

  selectCell(row, col) {
    this.selectedCell = { row, col };
    this.applySelectionHighlight();
  }

  clearSelection() {
    this.selectedCell = null;
    this.highlightedCells = [];
    this.applySelectionHighlight();
  }

  applySelectionHighlight() {
    const cells = this.boardElement.querySelectorAll(".board-cell");
    cells.forEach((cell) => {
      cell.classList.remove("selected");
      cell.classList.remove("valid-move");
    });

    if (!this.selectedCell || !this.snapshot) return;

    const selector = `.board-cell[data-row="${this.selectedCell.row}"][data-col="${this.selectedCell.col}"]`;
    const selectedEl = this.boardElement.querySelector(selector);
    if (selectedEl) {
      selectedEl.classList.add("selected");
    }

    const moves = this.getValidMoves(this.selectedCell.row, this.selectedCell.col);
    moves.forEach(({ row, col }) => {
      const cell = this.boardElement.querySelector(`.board-cell[data-row="${row}"][data-col="${col}"]`);
      if (cell) {
        cell.classList.add("valid-move");
      }
    });
  }

  getValidMoves(row, col) {
    if (!this.snapshot) return [];
    const board = this.snapshot.board;
    const piece = board[row]?.[col];
    if (!piece || !piece.revealed) return [];

    const moves = [];
    DIRECTIONS.forEach((dir) => {
      const newRow = row + dir.row;
      const newCol = col + dir.col;
      if (!isInsideBoard(newRow, newCol)) return;

      const target = board[newRow]?.[newCol];
      if (!target) {
        moves.push({ row: newRow, col: newCol });
        return;
      }

      if (!target.revealed) return;
      if (target.color === piece.color) return;

      if (target.type === piece.type) {
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

  getLocalColor() {
    if (!this.snapshot || !this.sessionToken) return null;
    return this.snapshot.sessionColors?.[this.sessionToken] || null;
  }
}
