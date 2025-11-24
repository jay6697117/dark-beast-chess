export type PlayerColor = 'red' | 'blue';
export type AnimalType = 'elephant' | 'lion' | 'tiger' | 'leopard' | 'wolf' | 'dog' | 'cat' | 'mouse';
export type GamePhase = 'SETUP' | 'COLOR_SELECTION' | 'PLAYING' | 'GAME_OVER';

export interface Piece {
    type: AnimalType;
    color: PlayerColor;
    revealed: boolean;
    id: string;
    position: { row: number; col: number };
    // Animation states
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

export class DarkBeastChess {
    board: (Piece | null)[][];
    phase: GamePhase;
    currentPlayer: PlayerColor | null;
    playerColors: { player1: PlayerColor | null; player2: PlayerColor | null };
    moveHistory: MoveRecord[];
    revealedPieces: Set<string>;
    selectedPiece: { row: number; col: number } | null;
    turn: number;
    consecutiveMoves: Map<string, number>;
    messages: { text: string; type: 'normal' | 'important' | 'error' | 'success' }[];

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
        this.selectedPiece = null;
        this.turn = 1;
        this.consecutiveMoves = new Map();
        this.messages = [];

        this.init();
    }

    init() {
        this.setupBoard();
        this.addMessage('游戏初始化完成，点击开始游戏按钮开始！');
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
                    isAppearing: true
                };
                pieceIndex++;
            }
        }

        // Remove appearing class after animation
        setTimeout(() => {
            this.board.forEach(row => row.forEach(p => {
                if (p) p.isAppearing = false;
            }));
        }, 600);
    }

    shuffleArray(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    startGame() {
        this.phase = 'COLOR_SELECTION';
        this.addMessage('游戏开始！请点击任意棋子翻开以决定您的颜色', 'important');
    }

    resetGame() {
        this.phase = 'SETUP';
        this.currentPlayer = null;
        this.playerColors = { player1: null, player2: null };
        this.moveHistory = [];
        this.revealedPieces = new Set();
        this.selectedPiece = null;
        this.turn = 1;
        this.consecutiveMoves = new Map();
        this.messages = [];
        this.setupBoard();
        this.addMessage('游戏已重置，点击开始游戏按钮开始新游戏！');
    }

    handleCellClick(row: number, col: number) {
        const piece = this.board[row][col];

        if (this.phase === 'COLOR_SELECTION') {
            this.handleColorSelection(row, col);
        } else if (this.phase === 'PLAYING') {
            if (this.selectedPiece) {
                // If clicking the same piece, deselect
                if (this.selectedPiece.row === row && this.selectedPiece.col === col) {
                    this.clearSelection();
                } else {
                    this.handleMove(row, col);
                }
            } else if (piece && piece.revealed && piece.color === this.currentPlayer) {
                this.selectPiece(row, col);
            } else if (piece && !piece.revealed) {
                this.handleFlip(row, col);
            }
        }
    }

    handleColorSelection(row: number, col: number) {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return;

        piece.isFlipping = true;

        // Delay logic to match animation
        setTimeout(() => {
            piece.revealed = true;
            piece.isFlipping = false;
            this.revealedPieces.add(`${row}-${col}`);

            this.playerColors.player1 = piece.color;
            this.playerColors.player2 = piece.color === 'red' ? 'blue' : 'red';
            this.currentPlayer = piece.color;

            this.phase = 'PLAYING';
            this.addMessage(`翻开了${this.getAnimalName(piece.type)}(${this.getColorName(piece.color)})，您是${this.getColorName(piece.color)}方！`, 'important');

            // Switch turn to the other player immediately
            this.endTurn();
        }, 400); // Half of animation time roughly
    }

    handleFlip(row: number, col: number) {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return;

        piece.isFlipping = true;

        setTimeout(() => {
            piece.revealed = true;
            piece.isFlipping = false;
            this.revealedPieces.add(`${row}-${col}`);

            if (piece.color === this.currentPlayer) {
                this.addMessage(`翻开了己方${this.getAnimalName(piece.type)}`, 'important');
            } else {
                this.addMessage(`翻开了对方${this.getAnimalName(piece.type)}`);
            }

            this.endTurn();
        }, 400);
    }

    selectPiece(row: number, col: number) {
        const piece = this.board[row][col];
        if (!piece || !piece.revealed || piece.color !== this.currentPlayer) return;

        this.clearSelection();
        this.selectedPiece = { row, col };
        this.addMessage(`选中了${this.getAnimalName(piece.type)}`);
    }

    clearSelection() {
        this.selectedPiece = null;
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

    handleMove(targetRow: number, targetCol: number) {
        if (!this.selectedPiece) return;

        const { row: fromRow, col: fromCol } = this.selectedPiece;
        const movingPiece = this.board[fromRow][fromCol];
        const targetPiece = this.board[targetRow][targetCol];

        if (!movingPiece) return;

        const validMoves = this.getValidMoves(fromRow, fromCol);
        const isValidMove = validMoves.some(move => move.row === targetRow && move.col === targetCol);

        if (!isValidMove) {
            this.addMessage('无效的移动！', 'error');
            movingPiece.isInvalid = true;
            setTimeout(() => movingPiece.isInvalid = false, 600);
            this.clearSelection();
            return;
        }

        // Anti-stalemate check
        const moveKey = `${fromRow}-${fromCol}-${targetRow}-${targetCol}`;
        const currentCount = this.consecutiveMoves.get(moveKey) || 0;

        if (currentCount >= 2) {
            this.addMessage('此移动已重复3次，先手方败！', 'error');
            this.endGame(this.currentPlayer === 'red' ? 'blue' : 'red');
            return;
        }

        if (targetPiece) {
            const battleResult = this.resolveBattle(movingPiece, targetPiece);
            this.executeBattle(fromRow, fromCol, targetRow, targetCol, battleResult);
        } else {
            this.executeMove(fromRow, fromCol, targetRow, targetCol);
        }

        this.moveHistory.push({
            from: { row: fromRow, col: fromCol },
            to: { row: targetRow, col: targetCol },
            piece: movingPiece.type,
            turn: this.turn
        });

        const newCount = currentCount + 1;
        this.consecutiveMoves.clear();
        this.consecutiveMoves.set(moveKey, newCount);

        this.clearSelection();
        // Turn end is handled in execute methods after animation
    }

    resolveBattle(attacker: Piece, defender: Piece): 'attacker_wins' | 'defender_wins' | 'both_die' {
        if (attacker.type === defender.type) return 'both_die';

        const attackerCanEat = this.eatRules[attacker.type] || [];
        if (attackerCanEat.includes(defender.type)) return 'attacker_wins';

        return 'defender_wins'; // Should be covered by valid moves check, but safe fallback
    }

    executeBattle(fromRow: number, fromCol: number, targetRow: number, targetCol: number, result: 'attacker_wins' | 'defender_wins' | 'both_die') {
        const attacker = this.board[fromRow][fromCol]!;
        const defender = this.board[targetRow][targetCol]!;

        attacker.isMoving = true;

        setTimeout(() => {
            attacker.isMoving = false;

            switch (result) {
                case 'attacker_wins':
                    defender.isEaten = true;
                    this.addMessage(`${this.getAnimalName(attacker.type)}吃掉了${this.getAnimalName(defender.type)}！`, 'important');
                    setTimeout(() => {
                        this.board[targetRow][targetCol] = attacker;
                        this.board[fromRow][fromCol] = null;
                        attacker.position = { row: targetRow, col: targetCol };
                        this.checkGameEnd();
                        this.endTurn();
                    }, 600);
                    break;

                case 'defender_wins':
                    attacker.isEaten = true;
                    this.addMessage(`${this.getAnimalName(defender.type)}击败了${this.getAnimalName(attacker.type)}！`);
                    setTimeout(() => {
                        this.board[fromRow][fromCol] = null;
                        this.checkGameEnd();
                        this.endTurn();
                    }, 600);
                    break;

                case 'both_die':
                    attacker.isEaten = true;
                    defender.isEaten = true;
                    this.addMessage(`${this.getAnimalName(attacker.type)}与${this.getAnimalName(defender.type)}同归于尽！`);
                    setTimeout(() => {
                        this.board[fromRow][fromCol] = null;
                        this.board[targetRow][targetCol] = null;
                        this.checkGameEnd();
                        this.endTurn();
                    }, 600);
                    break;
            }
        }, 300);
    }

    executeMove(fromRow: number, fromCol: number, targetRow: number, targetCol: number) {
        const piece = this.board[fromRow][fromCol]!;
        piece.isMoving = true;

        setTimeout(() => {
            piece.isMoving = false;
            this.board[targetRow][targetCol] = piece;
            this.board[fromRow][fromCol] = null;
            piece.position = { row: targetRow, col: targetCol };
            this.addMessage(`${this.getAnimalName(piece.type)}移动到新位置`);
            this.checkGameEnd();
            this.endTurn();
        }, 300);
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
        const opponent = this.currentPlayer; // The one who just moved

        // Check if next player has any valid moves
        // Note: This logic in original game.js was slightly buggy/ambiguous about who 'nextPlayer' is relative to 'endTurn' call timing.
        // In original: checkGameEnd is called BEFORE endTurn. So currentPlayer is the one who just moved.
        // nextPlayer is the one who is ABOUT TO move.
        // If nextPlayer cannot move, they lose.

        // However, we call checkGameEnd before endTurn here too.
        // So nextPlayer IS the opponent of the current mover.

        if (!this.canColorMove(nextPlayer)) {
             // If next player cannot move, the CURRENT player wins (so next player loses)
             // Wait, if next player cannot move, they lose.
             // Original code: endGame(opponent) -> opponent is currentPlayer.
             // So if next player cannot move, current player wins. Correct.
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

    endGame(winner: PlayerColor) {
        this.phase = 'GAME_OVER';
        const winnerName = this.getColorName(winner);
        this.addMessage(`游戏结束！${winnerName}方获胜！`, 'important');

        // Mark winning pieces for animation
        this.board.forEach(row => row.forEach(p => {
            if (p && p.color === winner) p.isVictory = true;
        }));
    }

    addMessage(text: string, type: 'normal' | 'important' | 'error' | 'success' = 'normal') {
        this.messages.push({ text, type });
        if (this.messages.length > 50) this.messages.shift();
    }

    getAnimalName(type: AnimalType): string {
        const names: Record<AnimalType, string> = {
            elephant: '象', lion: '狮', tiger: '虎', leopard: '豹',
            wolf: '狼', dog: '狗', cat: '猫', mouse: '鼠'
        };
        return names[type] || type;
    }

    getColorName(color: PlayerColor): string {
        return color === 'red' ? '红' : '蓝';
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
