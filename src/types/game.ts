export type PlayerColor = 'red' | 'blue';

export type PieceType = 'elephant' | 'lion' | 'tiger' | 'leopard' | 'wolf' | 'dog' | 'cat' | 'rat';

export interface Piece {
  id: number;
  type: PieceType;
  color: PlayerColor;
  isRevealed: boolean;
  isDead: boolean;
}

export interface Cell {
  id: number; // 0-15
  piece: Piece | null;
}

export type GameStatus = 'ready' | 'playing' | 'red_won' | 'blue_won';

export interface GameState {
  board: Cell[];
  turn: number;
  currentPlayer: PlayerColor;
  playerColor: PlayerColor | null; // The color of the player who flipped the first piece (or assigned randomly)
  status: GameStatus;
  selectedCellId: number | null;
  redPiecesCount: number;
  bluePiecesCount: number;
  messages: string[];
}
