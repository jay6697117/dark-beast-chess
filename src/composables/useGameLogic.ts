import { ref, computed } from 'vue';
import type { Piece, PieceType, PlayerColor, GameStatus, Cell } from '../types/game';

// Rank definition: Higher index means stronger (except Rat vs Elephant)
const RANKS: Record<PieceType, number> = {
  rat: 1,
  cat: 2,
  dog: 3,
  wolf: 4,
  leopard: 5,
  tiger: 6,
  lion: 7,
  elephant: 8,
};

const PIECE_NAMES: Record<PieceType, string> = {
  rat: '鼠',
  cat: '猫',
  dog: '狗',
  wolf: '狼',
  leopard: '豹',
  tiger: '虎',
  lion: '狮',
  elephant: '象',
};

export function useGameLogic() {
  const board = ref<Cell[]>([]);
  const turn = ref(0);
  const currentPlayer = ref<PlayerColor>('red'); // Default starter, but color is assigned on first flip
  const myColor = ref<PlayerColor | null>(null); // The color assigned to the first player who flips
  const status = ref<GameStatus>('ready');
  const selectedCellId = ref<number | null>(null);
  const messages = ref<string[]>([]);

  // Initialize the game
  const initGame = () => {
    const pieces: Piece[] = [];
    const types: PieceType[] = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'rat'];

    // Create 2 sets of pieces (Red and Blue)
    let idCounter = 1;
    types.forEach(type => {
      pieces.push({ id: idCounter++, type, color: 'red', isRevealed: false, isDead: false });
      pieces.push({ id: idCounter++, type, color: 'blue', isRevealed: false, isDead: false });
    });

    // Shuffle pieces
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    // Create board cells
    board.value = Array.from({ length: 16 }, (_, i) => ({
      id: i,
      piece: pieces[i],
    }));

    turn.value = 1;
    currentPlayer.value = 'red'; // Arbitrary start, color determined on first flip
    myColor.value = null;
    status.value = 'playing';
    selectedCellId.value = null;
    messages.value = ['游戏开始！请翻开任意一张棋子。'];
  };

  const addMessage = (msg: string) => {
    messages.value.unshift(msg);
    if (messages.value.length > 5) messages.value.pop();
  };

  const switchTurn = () => {
    currentPlayer.value = currentPlayer.value === 'red' ? 'blue' : 'red';
    turn.value++;
  };

  const isValidMove = (fromId: number, toId: number): boolean => {
    const row1 = Math.floor(fromId / 4);
    const col1 = fromId % 4;
    const row2 = Math.floor(toId / 4);
    const col2 = toId % 4;
    return Math.abs(row1 - row2) + Math.abs(col1 - col2) === 1;
  };

  const canCapture = (attacker: Piece, defender: Piece): boolean => {
    // Special Case: Rat eats Elephant
    if (attacker.type === 'rat' && defender.type === 'elephant') return true;
    // Special Case: Elephant cannot eat Rat
    if (attacker.type === 'elephant' && defender.type === 'rat') return false;
    // Normal Rank Check
    return RANKS[attacker.type] >= RANKS[defender.type];
  };

  const handleCellClick = (cellId: number) => {
    if (status.value !== 'playing') return;

    const cell = board.value[cellId];
    const piece = cell.piece;

    // Case 1: Flip a hidden piece
    if (piece && !piece.isRevealed) {
      // Cannot flip if we have a selected piece (must move or cancel)
      if (selectedCellId.value !== null) {
        selectedCellId.value = null; // Auto-cancel selection if clicking a hidden piece
        // Or should we prevent flipping? Usually in this game, you can flip instead of moving.
        // Let's allow flipping, but it consumes the turn.
      }

      piece.isRevealed = true;
      addMessage(`${currentPlayer.value === 'red' ? '红方' : '蓝方'} 翻开了 ${piece.color === 'red' ? '红' : '蓝'}${PIECE_NAMES[piece.type]}`);

      // First flip determines colors
      if (myColor.value === null) {
        myColor.value = piece.color; // The player who flipped gets this color
        // If the current player (who flipped) is 'red' (default start), then 'red' is assigned to this color.
        // Wait, logic correction:
        // Usually, the first person to flip *becomes* that color.
        // Since we track `currentPlayer` as 'red'/'blue', we need to map "Player 1" and "Player 2" to colors.
        // But for a simple hotseat game, we just say "Current Turn: Red" or "Blue".
        // If the first flip is Red, then the current player IS Red.
        // If the first flip is Blue, then the current player IS Blue.
        // So we might need to adjust `currentPlayer` to match the flipped piece if it's the very first turn.

        if (turn.value === 1) {
             currentPlayer.value = piece.color;
             addMessage(`先手玩家执 ${piece.color === 'red' ? '红' : '蓝'} 色`);
        }
      }

      switchTurn();
      return;
    }

    // Case 2: Select a piece
    if (piece && piece.isRevealed && piece.color === currentPlayer.value) {
      selectedCellId.value = cellId;
      return;
    }

    // Case 3: Move or Capture
    if (selectedCellId.value !== null) {
      const fromId = selectedCellId.value;
      const fromCell = board.value[fromId];
      const fromPiece = fromCell.piece!;

      // Validate adjacency
      if (!isValidMove(fromId, cellId)) {
        // If clicking another own piece, switch selection
        if (piece && piece.isRevealed && piece.color === currentPlayer.value) {
          selectedCellId.value = cellId;
        } else {
          selectedCellId.value = null; // Cancel selection
        }
        return;
      }

      // Empty cell -> Move
      if (!piece) {
        board.value[cellId].piece = fromPiece;
        board.value[fromId].piece = null;
        selectedCellId.value = null;
        addMessage(`${fromPiece.color === 'red' ? '红' : '蓝'}${PIECE_NAMES[fromPiece.type]} 移动`);
        switchTurn();
        return;
      }

      // Occupied cell -> Capture?
      if (piece.isRevealed && piece.color !== currentPlayer.value) {
        if (canCapture(fromPiece, piece)) {
          const victimName = PIECE_NAMES[piece.type];
          const killerName = PIECE_NAMES[fromPiece.type];

          // Check for mutual destruction (Same Rank)
          if (RANKS[fromPiece.type] === RANKS[piece.type]) {
             board.value[cellId].piece = null;
             board.value[fromId].piece = null;
             addMessage(`${killerName} 与 ${victimName} 同归于尽`);
          } else {
             board.value[cellId].piece = fromPiece;
             board.value[fromId].piece = null;
             addMessage(`${killerName} 吃掉了 ${victimName}`);
          }

          checkWinCondition();
          selectedCellId.value = null;
          switchTurn();
        } else {
          addMessage(`无法吃掉对方！(${PIECE_NAMES[fromPiece.type]} < ${PIECE_NAMES[piece.type]})`);
          selectedCellId.value = null;
        }
        return;
      }
    }
  };

  const checkWinCondition = () => {
    const redAlive = board.value.some(c => c.piece && c.piece.color === 'red');
    const blueAlive = board.value.some(c => c.piece && c.piece.color === 'blue');

    if (!redAlive) {
      status.value = 'blue_won';
      addMessage('蓝方获胜！');
    } else if (!blueAlive) {
      status.value = 'red_won';
      addMessage('红方获胜！');
    }
  };

  const resetGame = () => {
      initGame();
  };

  const redPiecesCount = computed(() => board.value.filter(c => c.piece?.color === 'red').length);
  const bluePiecesCount = computed(() => board.value.filter(c => c.piece?.color === 'blue').length);

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
