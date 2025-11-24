import { reactive, computed } from 'vue';
import { DarkBeastChess } from '../game/DarkBeastChess';

const game = reactive(new DarkBeastChess());

export function useGameLogic() {
  const board = computed(() => {
    // Flatten the 2D board for the template which expects a flat list or we can adapt the template
    // But since GameBoard.vue uses v-for, a flat list with IDs is easier if we want to keep it simple.
    // However, the original GameBoard.vue expected a flat array of cells.
    // Let's map the 2D board to a flat array of cells.
    const cells = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const piece = game.board[row][col];
        cells.push({
          id: row * 4 + col,
          row,
          col,
          piece
        });
      }
    }
    return cells;
  });

  const turn = computed(() => game.turn);
  const currentPlayer = computed(() => game.currentPlayer);
  const status = computed(() => game.phase);
  const selectedCellId = computed(() => {
    if (!game.selectedPiece) return null;
    return game.selectedPiece.row * 4 + game.selectedPiece.col;
  });
  const messages = computed(() => [...game.messages].reverse()); // Newest first

  const redPiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.red;
  });

  const bluePiecesCount = computed(() => {
    const stats = game.getStats();
    return stats.blue;
  });

  const initGame = () => {
    // Game is already initialized in constructor, but we can reset if needed
    if (game.phase === 'GAME_OVER') {
        game.resetGame();
    }
  };

  const handleCellClick = (id: number) => {
    const row = Math.floor(id / 4);
    const col = id % 4;
    game.handleCellClick(row, col);
  };

  const resetGame = () => {
    game.resetGame();
  };

  return {
    board,
    turn,
    currentPlayer,
    status,
    selectedCellId,
    messages,
    redPiecesCount,
    bluePiecesCount,
    initGame,
    handleCellClick,
    resetGame
  };
}
