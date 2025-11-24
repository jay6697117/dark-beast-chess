export type PlayerColor = 'red' | 'blue';
export type AnimalType = 'elephant' | 'lion' | 'tiger' | 'leopard' | 'wolf' | 'dog' | 'cat' | 'mouse';
export type GamePhase = 'SETUP' | 'COLOR_SELECTION' | 'PLAYING' | 'GAME_OVER';

export interface Piece {
    type: AnimalType;
    color: PlayerColor;
    revealed: boolean;
    id: string;
    position: { row: number; col: number };
    // Animation states - kept here for compatibility, but CoreEngine might not use them all
    isFlipping?: boolean;
    isMoving?: boolean;
    isEaten?: boolean;
    isVictory?: boolean;
    isInvalid?: boolean;
    isAppearing?: boolean;
}

export interface MoveRecord {
    from: { row: number; col: number };
    to: { row: number; col: number };
    piece: AnimalType;
    turn: number;
}

export interface BattleResult {
    type: 'attacker_wins' | 'defender_wins' | 'both_die';
    attacker: Piece;
    defender: Piece;
}
