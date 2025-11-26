import { CoreEngine } from './core/CoreEngine.ts';
import type { Piece, PlayerColor, AnimalType, GamePhase } from './core/types.ts';

export type { Piece, PlayerColor, AnimalType, GamePhase };

export class DarkBeastChess extends CoreEngine {
    selectedPiece: { row: number; col: number } | null;
    messages: { text: string; type: 'normal' | 'important' | 'error' | 'success' }[];

    constructor() {
        super();
        this.selectedPiece = null;
        this.messages = [];
        // Initial message
        this.addMessage('游戏初始化完成，点击开始游戏按钮开始！');
    }

    // Override init to add message
    init() {
        super.init();
    }

    // Override setupBoard to add animation flags
    setupBoard() {
        super.setupBoard();
        // Add isAppearing flag for animation
        this.board.forEach(row => row.forEach(p => {
            if (p) p.isAppearing = true;
        }));

        setTimeout(() => {
            this.board.forEach(row => row.forEach(p => {
                if (p) p.isAppearing = false;
            }));
        }, 600);
    }

    startGame() {
        super.startGame();
        this.addMessage('游戏开始！请点击任意棋子翻开以决定您的颜色', 'important');
    }

    resetGame() {
        super.resetGame();
        this.selectedPiece = null;
        this.messages = [];
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

        // Delay logic to匹配翻牌动画时长
        setTimeout(() => {
            piece.isFlipping = false;

            const result = this.processColorSelection(row, col);
            if (result.success && result.piece) {
                this.addMessage(`翻开了${this.getAnimalName(result.piece.type)}(${this.getColorName(result.piece.color)})，您是${this.getColorName(result.piece.color)}方！`, 'important');
            }
        }, 850);
    }

    handleFlip(row: number, col: number) {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return;

        piece.isFlipping = true;

        setTimeout(() => {
            piece.isFlipping = false;

            // We need to capture current player BEFORE flip to know who flipped it (for message)
            // But CoreEngine.processFlip switches turn immediately.
            // Actually CoreEngine.processFlip switches turn.
            // So we should check currentPlayer BEFORE calling processFlip.
            const playerWhoFlipped = this.currentPlayer;

            const result = this.processFlip(row, col);

            if (result.success && result.piece) {
                if (result.piece.color === playerWhoFlipped) {
                    this.addMessage(`翻开了己方${this.getAnimalName(result.piece.type)}`, 'important');
                } else {
                    this.addMessage(`翻开了对方${this.getAnimalName(result.piece.type)}`);
                }
            }
        }, 850);
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

    handleMove(targetRow: number, targetCol: number) {
        if (!this.selectedPiece) return;

        const { row: fromRow, col: fromCol } = this.selectedPiece;
        const movingPiece = this.board[fromRow][fromCol];

        if (!movingPiece) return;

        // Validate first
        const validation = this.validateMove(fromRow, fromCol, targetRow, targetCol);

        if (!validation.valid) {
            if (validation.reason === 'Stalemate detected') {
                 this.addMessage('此移动已重复3次，先手方败！', 'error');
                 this.endGame(this.currentPlayer === 'red' ? 'blue' : 'red');
            } else {
                this.addMessage('无效的移动！', 'error');
                movingPiece.isInvalid = true;
                setTimeout(() => movingPiece.isInvalid = false, 600);
            }
            this.clearSelection();
            return;
        }

        // Execute with animation
        if (validation.result) {
            this.executeBattleWithAnimation(fromRow, fromCol, targetRow, targetCol, validation.result);
        } else {
            this.executeMoveWithAnimation(fromRow, fromCol, targetRow, targetCol);
        }

        this.clearSelection();
    }

    executeBattleWithAnimation(fromRow: number, fromCol: number, targetRow: number, targetCol: number, result: any) {
        const attacker = this.board[fromRow][fromCol]!;
        const defender = this.board[targetRow][targetCol]!;

        attacker.isMoving = true;

        setTimeout(() => {
            attacker.isMoving = false;

            switch (result.type) {
                case 'attacker_wins':
                    defender.isEaten = true;
                    this.addMessage(`${this.getAnimalName(attacker.type)}吃掉了${this.getAnimalName(defender.type)}！`, 'important');
                    setTimeout(() => {
                        // Call core execute - we know it's valid
                        // But wait, CoreEngine.executeMove does validation again and updates state.
                        // We should probably just call executeMove now.
                        // But we need to be careful not to double-trigger turn end or events if we already did validation.
                        // CoreEngine.executeMove does everything.
                        // So we just call it here.
                        this.executeMove(fromRow, fromCol, targetRow, targetCol);
                    }, 600);
                    break;

                case 'defender_wins':
                    attacker.isEaten = true;
                    this.addMessage(`${this.getAnimalName(defender.type)}击败了${this.getAnimalName(attacker.type)}！`);
                    setTimeout(() => {
                        this.executeMove(fromRow, fromCol, targetRow, targetCol);
                    }, 600);
                    break;

                case 'both_die':
                    attacker.isEaten = true;
                    defender.isEaten = true;
                    this.addMessage(`${this.getAnimalName(attacker.type)}与${this.getAnimalName(defender.type)}同归于尽！`);
                    setTimeout(() => {
                        this.executeMove(fromRow, fromCol, targetRow, targetCol);
                    }, 600);
                    break;
            }
        }, 300);
    }

    executeMoveWithAnimation(fromRow: number, fromCol: number, targetRow: number, targetCol: number) {
        const piece = this.board[fromRow][fromCol]!;
        piece.isMoving = true;

        setTimeout(() => {
            piece.isMoving = false;
            this.executeMove(fromRow, fromCol, targetRow, targetCol);
            this.addMessage(`${this.getAnimalName(piece.type)}移动到新位置`);
        }, 300);
    }

    // Override endGame to add message and animation
    endGame(winner: PlayerColor) {
        super.endGame(winner);
        const winnerName = this.getColorName(winner);
        this.addMessage(`游戏结束！${winnerName}方获胜！`, 'important');

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
}
