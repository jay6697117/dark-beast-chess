// 暗兽棋游戏逻辑
class DarkBeastChess {
    constructor() {
        this.board = Array(4).fill(null).map(() => Array(4).fill(null));
        this.phase = 'SETUP'; // SETUP, COLOR_SELECTION, PLAYING, GAME_OVER
        this.currentPlayer = null; // 'red' or 'blue'
        this.playerColors = { player1: null, player2: null };
        this.moveHistory = [];
        this.revealedPieces = new Set();
        this.selectedPiece = null;
        this.turn = 1;
        this.consecutiveMoves = new Map(); // 防僵局机制
        
        this.animals = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'];
        this.colors = ['red', 'blue'];
        
        // 吃子规则表
        this.eatRules = {
            elephant: ['lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat'],
            lion: ['tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'],
            tiger: ['leopard', 'wolf', 'dog', 'cat', 'mouse'],
            leopard: ['wolf', 'dog', 'cat', 'mouse'],
            wolf: ['dog', 'cat', 'mouse'],
            dog: ['cat', 'mouse'],
            cat: ['mouse'],
            mouse: ['mouse', 'elephant'] // 鼠克象特殊规则
        };
        
        this.init();
    }
    
    init() {
        this.setupBoard();
        this.renderBoard();
        this.updateUI();
        this.addMessage('游戏初始化完成，点击开始游戏按钮开始！');
    }
    
    setupBoard() {
        // 创建棋子数组
        const pieces = [];
        
        // 每种动物各两枚（红蓝各一）
        this.animals.forEach(animal => {
            this.colors.forEach(color => {
                pieces.push({ type: animal, color, revealed: false });
            });
        });
        
        // 随机打乱棋子
        this.shuffleArray(pieces);
        
        // 放置到棋盘上
        let pieceIndex = 0;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                this.board[row][col] = {
                    ...pieces[pieceIndex],
                    position: { row, col },
                    id: `piece-${row}-${col}`
                };
                pieceIndex++;
            }
        }
    }
    
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    renderBoard() {
        const boardElement = document.getElementById('gameBoard');
        boardElement.innerHTML = '';
        
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const cell = document.createElement('div');
                cell.className = 'board-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                const piece = this.board[row][col];
                if (piece) {
                    const pieceElement = this.createPieceElement(piece);
                    cell.appendChild(pieceElement);
                }
                
                cell.addEventListener('click', (e) => this.handleCellClick(e, row, col));
                boardElement.appendChild(cell);
            }
        }
    }
    
    createPieceElement(piece) {
        const pieceElement = document.createElement('div');
        pieceElement.className = 'piece';
        pieceElement.dataset.type = piece.type;
        pieceElement.dataset.color = piece.color;
        pieceElement.id = piece.id;
        
        if (piece.revealed) {
            pieceElement.classList.add(piece.color);
            pieceElement.classList.add(`piece-${piece.type}`);
        } else {
            pieceElement.classList.add('hidden');
        }
        
        return pieceElement;
    }
    
    handleCellClick(e, row, col) {
        const piece = this.board[row][col];
        
        if (this.phase === 'COLOR_SELECTION') {
            this.handleColorSelection(row, col);
        } else if (this.phase === 'PLAYING') {
            if (this.selectedPiece) {
                this.handleMove(row, col);
            } else if (piece && piece.revealed && piece.color === this.currentPlayer) {
                this.selectPiece(row, col);
            } else if (piece && !piece.revealed) {
                this.handleFlip(row, col);
            }
        }
    }
    
    handleColorSelection(row, col) {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return;
        
        // 翻开第一枚棋子决定颜色
        piece.revealed = true;
        this.revealedPieces.add(`${row}-${col}`);
        
        // 设定玩家颜色
        this.playerColors.player1 = piece.color;
        this.playerColors.player2 = piece.color === 'red' ? 'blue' : 'red';
        this.currentPlayer = piece.color;
        
        // 动画效果
        const pieceElement = document.getElementById(piece.id);
        pieceElement.classList.add('flipping');
        
        setTimeout(() => {
            this.renderBoard();
            this.phase = 'PLAYING';
            this.updateUI();
            this.addMessage(`翻开了${this.getAnimalName(piece.type)}(${this.getColorName(piece.color)})，您是${this.getColorName(piece.color)}方！`, 'important');
        }, 300);
    }
    
    handleFlip(row, col) {
        const piece = this.board[row][col];
        if (!piece || piece.revealed) return;
        
        piece.revealed = true;
        this.revealedPieces.add(`${row}-${col}`);
        
        // 动画效果
        const pieceElement = document.getElementById(piece.id);
        pieceElement.classList.add('flipping');
        
        setTimeout(() => {
            this.renderBoard();
            
            if (piece.color === this.currentPlayer) {
                this.addMessage(`翻开了己方${this.getAnimalName(piece.type)}`, 'important');
            } else {
                this.addMessage(`翻开了对方${this.getAnimalName(piece.type)}`);
            }
            
            this.endTurn();
        }, 300);
    }
    
    selectPiece(row, col) {
        const piece = this.board[row][col];
        if (!piece || !piece.revealed || piece.color !== this.currentPlayer) return;
        
        // 清除之前的选择
        this.clearSelection();
        
        this.selectedPiece = { row, col };
        
        // 高亮选中的棋子
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        cell.classList.add('selected');
        
        // 显示可移动位置
        this.showValidMoves(row, col);
        
        this.addMessage(`选中了${this.getAnimalName(piece.type)}`);
    }
    
    showValidMoves(row, col) {
        const validMoves = this.getValidMoves(row, col);
        validMoves.forEach(({row: r, col: c}) => {
            const cell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            cell.classList.add('valid-move');
        });
    }
    
    getValidMoves(row, col) {
        const moves = [];
        const piece = this.board[row][col];
        // 只有已翻开的己方棋子可走
        if (!piece || !piece.revealed) return moves;

        const directions = [
            {row: -1, col: 0}, // 上
            {row: 1, col: 0},  // 下
            {row: 0, col: -1}, // 左
            {row: 0, col: 1}   // 右
        ];

        directions.forEach(dir => {
            const newRow = row + dir.row;
            const newCol = col + dir.col;

            if (!this.isValidPosition(newRow, newCol)) return;

            const targetPiece = this.board[newRow][newCol];

            // 空位可以移动
            if (!targetPiece) {
                moves.push({row: newRow, col: newCol});
                return;
            }

            // 未翻开的棋子不能被走入，只能翻棋
            if (!targetPiece.revealed) return;

            // 只能与对方颜色进行战斗
            if (targetPiece.color === piece.color) return;

            // 根据吃子规则判断是否允许进入该格（发起战斗）
            // 规则：
            // 1) 同类互吃：允许进入，结果同归于尽
            // 2) 若攻击方可以吃防守方：允许进入
            // 3) 若攻击方不能吃防守方：不允许进入（禁止“送死”）
            if (piece.type === targetPiece.type) {
                moves.push({row: newRow, col: newCol});
                return;
            }

            const attackerCanEat = this.eatRules[piece.type] || [];
            if (attackerCanEat.includes(targetPiece.type)) {
                moves.push({row: newRow, col: newCol});
            }
        });

        return moves;
    }
    
    handleMove(targetRow, targetCol) {
        if (!this.selectedPiece) return;
        
        const { row: fromRow, col: fromCol } = this.selectedPiece;
        const movingPiece = this.board[fromRow][fromCol];
        const targetPiece = this.board[targetRow][targetCol];
        
        // 检查是否是有效移动
        const validMoves = this.getValidMoves(fromRow, fromCol);
        const isValidMove = validMoves.some(move => move.row === targetRow && move.col === targetCol);
        
        if (!isValidMove) {
            this.addMessage('无效的移动！', 'error');
            this.clearSelection();
            return;
        }
        
        // 检查防僵局机制
        const moveKey = `${fromRow}-${fromCol}-${targetRow}-${targetCol}`;
        const currentCount = this.consecutiveMoves.get(moveKey) || 0;
        
        if (currentCount >= 2) {
            this.addMessage('此移动已重复3次，先手方败！', 'error');
            this.endGame(this.currentPlayer === 'red' ? 'blue' : 'red');
            return;
        }
        
        // 执行移动
        if (targetPiece) {
            // 战斗逻辑
            const battleResult = this.resolveBattle(movingPiece, targetPiece);
            this.executeBattle(fromRow, fromCol, targetRow, targetCol, battleResult);
        } else {
            // 普通移动
            this.executeMove(fromRow, fromCol, targetRow, targetCol);
        }
        
        // 记录移动历史
        this.moveHistory.push({
            from: {row: fromRow, col: fromCol},
            to: {row: targetRow, col: targetCol},
            piece: movingPiece.type,
            turn: this.turn
        });
        
        // 更新防僵局计数
        // 只保留当前移动的计数，清除其他移动的计数
        const newCount = currentCount + 1;
        this.consecutiveMoves.clear();
        this.consecutiveMoves.set(moveKey, newCount);
        
        this.clearSelection();
        this.endTurn();
    }
    
    resolveBattle(attacker, defender) {
        // 同类相遇同归于尽
        if (attacker.type === defender.type) {
            return 'both_die';
        }
        
        // 检查吃子规则
        const attackerCanEat = this.eatRules[attacker.type] || [];
        if (attackerCanEat.includes(defender.type)) {
            return 'attacker_wins';
        }
        
        const defenderCanEat = this.eatRules[defender.type] || [];
        if (defenderCanEat.includes(attacker.type)) {
            return 'defender_wins';
        }
        
        // 默认情况（不应该发生）
        return 'defender_wins';
    }
    
    executeBattle(fromRow, fromCol, targetRow, targetCol, result) {
        const attacker = this.board[fromRow][fromCol];
        const defender = this.board[targetRow][targetCol];
        
        // 播放动画
        const attackerElement = document.getElementById(attacker.id);
        const defenderElement = document.getElementById(defender.id);
        
        attackerElement.classList.add('moving');
        
        setTimeout(() => {
            switch (result) {
                case 'attacker_wins':
                    defenderElement.classList.add('eaten');
                    this.addMessage(`${this.getAnimalName(attacker.type)}吃掉了${this.getAnimalName(defender.type)}！`, 'important');
                    setTimeout(() => {
                        this.board[targetRow][targetCol] = attacker;
                        this.board[fromRow][fromCol] = null;
                        attacker.position = {row: targetRow, col: targetCol};
                        this.renderBoard();
                        this.checkGameEnd();
                    }, 400);
                    break;
                    
                case 'defender_wins':
                    attackerElement.classList.add('eaten');
                    this.addMessage(`${this.getAnimalName(defender.type)}击败了${this.getAnimalName(attacker.type)}！`);
                    setTimeout(() => {
                        this.board[fromRow][fromCol] = null;
                        this.renderBoard();
                        this.checkGameEnd();
                    }, 400);
                    break;
                    
                case 'both_die':
                    attackerElement.classList.add('eaten');
                    defenderElement.classList.add('eaten');
                    this.addMessage(`${this.getAnimalName(attacker.type)}与${this.getAnimalName(defender.type)}同归于尽！`);
                    setTimeout(() => {
                        this.board[fromRow][fromCol] = null;
                        this.board[targetRow][targetCol] = null;
                        this.renderBoard();
                        this.checkGameEnd();
                    }, 400);
                    break;
            }
        }, 200);
    }
    
    executeMove(fromRow, fromCol, targetRow, targetCol) {
        const piece = this.board[fromRow][fromCol];
        
        // 播放移动动画
        const pieceElement = document.getElementById(piece.id);
        pieceElement.classList.add('moving');
        
        setTimeout(() => {
            this.board[targetRow][targetCol] = piece;
            this.board[fromRow][fromCol] = null;
            piece.position = {row: targetRow, col: targetCol};
            this.renderBoard();
            this.addMessage(`${this.getAnimalName(piece.type)}移动到新位置`);
            // 普通移动后也需要判断是否形成“对方无有效走棋”的胜负条件
            this.checkGameEnd();
        }, 250);
    }
    
    clearSelection() {
        this.selectedPiece = null;
        
        // 清除高亮
        document.querySelectorAll('.board-cell').forEach(cell => {
            cell.classList.remove('selected', 'valid-move');
        });
    }
    
    endTurn() {
        this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
        this.turn++;
        this.updateUI();
    }
    
    checkGameEnd() {
        // 统计双方剩余棋子（无论是否翻开）与是否还有暗子
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

        // 条件1：全灭胜负
        if (redPieces === 0) {
            this.endGame('blue');
            return;
        }
        if (bluePieces === 0) {
            this.endGame('red');
            return;
        }

        // 条件2：迫使对方无法有效走棋
        // 有暗子时，对方至少可以翻棋 => 不判负
        if (hasUnrevealed) return;

        // 检查下一手玩家是否有合法走棋
        const nextPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
        const opponent = this.currentPlayer; // 刚走完的一方

        const nextCanMove = this.canColorMove(nextPlayer);
        if (!nextCanMove) {
            this.endGame(opponent);
        }
    }

    canColorMove(color) {
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
    
    endGame(winner) {
        this.phase = 'GAME_OVER';
        this.updateUI();
        
        const winnerName = this.getColorName(winner);
        this.addMessage(`游戏结束！${winnerName}方获胜！`, 'important');
        
        // 显示胜利对话框
        document.getElementById('victory-title').textContent = '游戏结束';
        document.getElementById('victory-message').textContent = `恭喜${winnerName}方获胜！`;
        document.getElementById('victoryModal').classList.add('show');
    }
    
    isValidPosition(row, col) {
        return row >= 0 && row < 4 && col >= 0 && col < 4;
    }
    
    updateUI() {
        // 更新阶段指示器
        const phaseIndicator = document.getElementById('phaseIndicator');
        switch (this.phase) {
            case 'SETUP':
                phaseIndicator.textContent = '游戏准备中';
                phaseIndicator.className = 'phase-indicator phase-setup';
                break;
            case 'COLOR_SELECTION':
                phaseIndicator.textContent = '翻棋定色';
                phaseIndicator.className = 'phase-indicator phase-color-selection';
                break;
            case 'PLAYING':
                phaseIndicator.textContent = '游戏进行中';
                phaseIndicator.className = 'phase-indicator phase-playing';
                break;
            case 'GAME_OVER':
                phaseIndicator.textContent = '游戏结束';
                phaseIndicator.className = 'phase-indicator phase-game-over';
                break;
        }
        
        // 更新当前玩家信息
        const playerIndicator = document.getElementById('playerIndicator');
        const playerText = document.getElementById('playerText');
        
        if (this.currentPlayer) {
            playerIndicator.className = `player-indicator ${this.currentPlayer}`;
            playerText.textContent = `当前玩家：${this.getColorName(this.currentPlayer)}方`;
        } else {
            playerIndicator.className = 'player-indicator';
            playerText.textContent = '点击开始游戏';
        }
        
        // 更新回合指示边框
        this.updateTurnIndicator();
        
        // 更新统计信息
        this.updateStats();
        
        // 更新按钮状态
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        startBtn.disabled = this.phase !== 'SETUP';
        resetBtn.disabled = false;
    }

    // 更新回合指示标题
    updateTurnIndicator() {
        const turnIndicator = document.getElementById('turnIndicator');
        const turnTitle = document.getElementById('turnTitle');
        
        // 移除所有回合指示类
        turnIndicator.classList.remove('red-turn', 'blue-turn');
        
        // 只在游戏进行中显示回合指示
        if (this.phase === 'PLAYING' && this.currentPlayer) {
            // 添加当前玩家的回合指示类
            turnIndicator.classList.add(`${this.currentPlayer}-turn`);
            
            // 更新标题文字
            const playerText = this.currentPlayer === 'red' ? '红方回合' : '蓝方回合';
            turnTitle.textContent = playerText;
        } else if (this.phase === 'SETUP') {
            turnTitle.textContent = '点击开始游戏';
        } else if (this.phase === 'GAME_OVER') {
            turnTitle.textContent = '游戏结束';
        }
    }
    
    updateStats() {
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
        
        document.getElementById('redPieces').textContent = redCount;
        document.getElementById('bluePieces').textContent = blueCount;
        document.getElementById('turnCount').textContent = Math.floor((this.turn - 1) / 2) + 1;
    }
    
    addMessage(text, type = 'normal') {
        const messagesContainer = document.getElementById('gameMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `message-item ${type}`;
        messageElement.textContent = `[回合${this.turn}] ${text}`;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // 限制消息数量
        const messages = messagesContainer.children;
        if (messages.length > 10) {
            messagesContainer.removeChild(messages[0]);
        }
    }
    
    getAnimalName(type) {
        const names = {
            elephant: '象', lion: '狮', tiger: '虎', leopard: '豹',
            wolf: '狼', dog: '狗', cat: '猫', mouse: '鼠'
        };
        return names[type] || type;
    }
    
    getColorName(color) {
        return color === 'red' ? '红' : '蓝';
    }
    
    startGame() {
        this.phase = 'COLOR_SELECTION';
        this.updateUI();
        this.addMessage('游戏开始！请点击任意棋子翻开以决定您的颜色', 'important');
    }
    
    resetGame() {
        // 重置所有状态
        this.board = Array(4).fill(null).map(() => Array(4).fill(null));
        this.phase = 'SETUP';
        this.currentPlayer = null;
        this.playerColors = { player1: null, player2: null };
        this.moveHistory = [];
        this.revealedPieces = new Set();
        this.selectedPiece = null;
        this.turn = 1;
        this.consecutiveMoves = new Map();
        
        // 重新初始化
        this.setupBoard();
        this.renderBoard();
        this.updateUI();
        
        // 清空消息
        document.getElementById('gameMessages').innerHTML = '';
        this.addMessage('游戏已重置，点击开始游戏按钮开始新游戏！');
    }
}

// 游戏控制器
class GameController {
    constructor() {
        this.game = null;
        this.init();
    }
    
    init() {
        this.game = new DarkBeastChess();
    }
    
    startGame() {
        if (this.game) {
            this.game.startGame();
        }
    }
    
    resetGame() {
        if (this.game) {
            this.game.resetGame();
        }
        closeModal();
    }
}

// 关闭模态框
function closeModal() {
    document.getElementById('victoryModal').classList.remove('show');
}

// 全局游戏控制器
let gameController;

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', function() {
    gameController = new GameController();
    
    // 添加键盘支持
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            if (gameController.game) {
                gameController.game.clearSelection();
            }
        }
    });
    
    // 阻止右键菜单
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
});

// 导出供HTML使用
window.gameController = gameController;
