import { Piece, PlayerColor, AnimalType, GamePhase, MoveRecord, BattleResult } from './types.ts';

export class CoreEngine {
    board: (Piece | null)[][];
    phase: GamePhase;
    currentPlayer: PlayerColor | null;
    playerColors: { player1: PlayerColor | null; player2: PlayerColor | null };
    moveHistory: MoveRecord[];
    revealedPieces: Set<string>;
    turn: number;
    consecutiveMoves: Map<string, number>;

    readonly animals: AnimalType[] = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'];
    readonly colors: PlayerColor[] = ['red', 'blue'];

    readonly eatRules: Record<AnimalType, AnimalType[]> = {
        elephant: ['lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat'],
        lion: ['tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'],
        tiger: ['leopard', 'wolf', 'dog', 'cat', 'mouse'],
        leopard: ['wolf', 'dog', 'cat', 'mouse'],
        wolf: ['dog', 'cat', 'mouse'],
        dog: ['cat', 'mouse'],
        cat: ['mouse'],
        mouse: ['mouse', 'elephant']
    };

    constructor() {
        this.board = [];
        this.phase = 'SETUP';
        this.currentPlayer = null;
        this.playerColors = { player1: null, player2: null };
        this.moveHistory = [];
        this.revealedPieces = new Set();
        this.turn = 1;
        this.consecutiveMoves = new Map();

        this.init();
    }

    init() {
        this.setupBoard();
    }

    setupBoard() {
        this.board = Array(4).fill(null).map(() => Array(4).fill(null));
        const pieces: Omit<Piece, 'position' | 'id'>[] = [];

        this.animals.forEach(animal => {
            this.colors.forEach(color => {
                pieces.push({ type: animal, color, revealed: false });
            });
        });

        this.shuffleArray(pieces);

        let pieceIndex = 0;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                this.board[row][col] = {
                    ...pieces[pieceIndex],
                    position: { row, col },
                    id: `piece-${row}-${col}`,
                    // Animation flags are initialized to false/undefined in core
                };
                pieceIndex++;
            }
        }
    }

    shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    startGame() {
        this.phase = 'COLOR_SELECTION';
    }

    resetGame() {
        this.phase = 'SETUP';
        this.currentPlayer = null;
        this.playerColors = { player1: null, player2: null };
        this.moveHistory = [];
        this.revealedPieces = new Set();
        this.turn = 1;
        this.consecutiveMoves = new Map();
        this.setupBoard();
    }

    // Pure logic for color selection
    processColorSelection(row: number, col: number): { success: boolean, piece?: Piece } {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return { success: false };

        piece.revealed = true;
        this.revealedPieces.add(`${row}-${col}`);

        this.playerColors.player1 = piece.color;
        this.playerColors.player2 = piece.color === 'red' ? 'blue' : 'red';
        this.currentPlayer = piece.color;
        this.phase = 'PLAYING';

        // Switch turn immediately as per new rules
        this.endTurn();

        return { success: true, piece };
    }

    // Pure logic for flipping
    processFlip(row: number, col: number): { success: boolean, piece?: Piece } {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return { success: false };

        piece.revealed = true;
        this.revealedPieces.add(`${row}-${col}`);
        this.endTurn();

        return { success: true, piece };
    }

    getValidMoves(row: number, col: number): { row: number; col: number }[] {
        const moves: { row: number; col: number }[] = [];
        const piece = this.board[row][col];
        if (!piece || !piece.revealed) return moves;

        const directions = [
            { row: -1, col: 0 },
            { row: 1, col: 0 },
            { row: 0, col: -1 },
            { row: 0, col: 1 }
        ];

        directions.forEach(dir => {
            const newRow = row + dir.row;
            const newCol = col + dir.col;

            if (!this.isValidPosition(newRow, newCol)) return;

            const targetPiece = this.board[newRow][newCol];

            if (!targetPiece) {
                moves.push({ row: newRow, col: newCol });
                return;
            }

            if (!targetPiece.revealed) return;
            if (targetPiece.color === piece.color) return;

            if (piece.type === targetPiece.type) {
                moves.push({ row: newRow, col: newCol });
                return;
            }

            const attackerCanEat = this.eatRules[piece.type] || [];
            if (attackerCanEat.includes(targetPiece.type)) {
                moves.push({ row: newRow, col: newCol });
            }
        });

        return moves;
    }

    isValidPosition(row: number, col: number) {
        return row >= 0 && row < 4 && col >= 0 && col < 4;
    }

    // Validates move and returns result type, but DOES NOT execute it (execution needs animation in UI)
    // Actually, for Core, we should probably have an execute method that updates state immediately.
    // The UI wrapper can handle the animation delays.
    validateMove(fromRow: number, fromCol: number, targetRow: number, targetCol: number): { valid: boolean, reason?: string, result?: BattleResult } {
        const movingPiece = this.board[fromRow][fromCol];
        const targetPiece = this.board[targetRow][targetCol];

        if (!movingPiece) return { valid: false, reason: 'No piece to move' };

        const validMoves = this.getValidMoves(fromRow, fromCol);
        const isValidMove = validMoves.some(move => move.row === targetRow && move.col === targetCol);

        if (!isValidMove) {
            return { valid: false, reason: 'Invalid move' };
        }

        // Anti-stalemate check
        const moveKey = `${fromRow}-${fromCol}-${targetRow}-${targetCol}`;
        const currentCount = this.consecutiveMoves.get(moveKey) || 0;

        if (currentCount >= 2) {
            return { valid: false, reason: 'Stalemate detected' };
        }

        let result: BattleResult | undefined;
        if (targetPiece) {
            result = this.resolveBattle(movingPiece, targetPiece);
        }

        return { valid: true, result };
    }

    resolveBattle(attacker: Piece, defender: Piece): BattleResult {
        if (attacker.type === defender.type) return { type: 'both_die', attacker, defender };

        const attackerCanEat = this.eatRules[attacker.type] || [];
        if (attackerCanEat.includes(defender.type)) return { type: 'attacker_wins', attacker, defender };

        return { type: 'defender_wins', attacker, defender };
    }

    // Updates the board state immediately.
    // Returns the result so UI can play animations if needed.
    executeMove(fromRow: number, fromCol: number, targetRow: number, targetCol: number): { success: boolean, result?: BattleResult, moveKey?: string } {
        const validation = this.validateMove(fromRow, fromCol, targetRow, targetCol);
        if (!validation.valid) return { success: false };

        const movingPiece = this.board[fromRow][fromCol]!;
        const targetPiece = this.board[targetRow][targetCol];

        // Update stalemate counter
        const moveKey = `${fromRow}-${fromCol}-${targetRow}-${targetCol}`;
        const currentCount = this.consecutiveMoves.get(moveKey) || 0;
        const newCount = currentCount + 1;
        this.consecutiveMoves.clear();
        this.consecutiveMoves.set(moveKey, newCount);

        // Record history
        this.moveHistory.push({
            from: { row: fromRow, col: fromCol },
            to: { row: targetRow, col: targetCol },
            piece: movingPiece.type,
            turn: this.turn
        });

        // Execute state change
        if (targetPiece && validation.result) {
            const result = validation.result;
            switch (result.type) {
                case 'attacker_wins':
                    this.board[targetRow][targetCol] = movingPiece;
                    this.board[fromRow][fromCol] = null;
                    movingPiece.position = { row: targetRow, col: targetCol };
                    break;
                case 'defender_wins':
                    this.board[fromRow][fromCol] = null;
                    break;
                case 'both_die':
                    this.board[fromRow][fromCol] = null;
                    this.board[targetRow][targetCol] = null;
                    break;
            }
            this.checkGameEnd();
            this.endTurn();
            return { success: true, result, moveKey };
        } else {
            // Normal move
            this.board[targetRow][targetCol] = movingPiece;
            this.board[fromRow][fromCol] = null;
            movingPiece.position = { row: targetRow, col: targetCol };

            this.checkGameEnd();
            this.endTurn();
            return { success: true, moveKey };
        }
    }

    endTurn() {
        if (this.phase === 'GAME_OVER') return;
        this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
        this.turn++;
    }

    checkGameEnd() {
        let redPieces = 0;
        let bluePieces = 0;
        let hasUnrevealed = false;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const piece = this.board[row][col];
                if (!piece) continue;
                if (!piece.revealed) hasUnrevealed = true;
                if (piece.color === 'red') redPieces++; else bluePieces++;
            }
        }

        if (redPieces === 0) {
            this.endGame('blue');
            return;
        }
        if (bluePieces === 0) {
            this.endGame('red');
            return;
        }

        if (hasUnrevealed) return;

        const nextPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
        const opponent = this.currentPlayer;

        if (!this.canColorMove(nextPlayer)) {
             this.endGame(opponent!);
        }
    }

    canColorMove(color: PlayerColor) {
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const piece = this.board[row][col];
                if (piece && piece.revealed && piece.color === color) {
                    if (this.getValidMoves(row, col).length > 0) return true;
                }
            }
        }
        return false;
    }

    endGame(_winner: PlayerColor) {
        this.phase = 'GAME_OVER';
        // UI should handle messages and victory flags
    }

    getStats() {
        let redCount = 0;
        let blueCount = 0;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const piece = this.board[row][col];
                if (piece && piece.revealed) {
                    if (piece.color === 'red') redCount++;
                    else blueCount++;
                }
            }
        }
        return { red: redCount, blue: blueCount };
    }
}
