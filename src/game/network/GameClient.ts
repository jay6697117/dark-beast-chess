
type MessageHandler = (type: string, payload: any) => void;

const resolveWsUrl = () => {
  console.log('import.meta.env.VITE_WS_URL:', import.meta.env.VITE_WS_URL);
    // 优先允许通过环境变量显式指定
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) {
        // @ts-ignore
        return import.meta.env.VITE_WS_URL as string;
    }

    if (typeof location !== 'undefined') {
        // Vite 开发常用 5173/4173 端口，后端默认 8000
        if (location.port === '5173' || location.port === '4173') {
            return 'ws://localhost:8000/ws';
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}/ws`;
    }

    return 'ws://localhost:8000/ws';
};

export class GameClient {
    ws: WebSocket | null = null;
    handlers: Map<string, MessageHandler[]> = new Map();
    sessionId: string | null = null;
    roomId: string | null = null;

    connect(url: string = resolveWsUrl()): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url);

            let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                console.error('WebSocket 连接超时');
                this.ws?.close();
                reject(new Error('WebSocket 连接超时'));
            }, 5000);

            const clearTimers = () => {
                if (timeout !== null) {
                    clearTimeout(timeout);
                    timeout = null;
                }
            };

            this.ws.onopen = () => {
                clearTimers();
                console.log('Connected to game server');
                resolve();
            };

            this.ws.onerror = (err) => {
                clearTimers();
                console.error('WebSocket error:', err);
                reject(err);
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                clearTimers();
                console.log('Disconnected from server');
                this.emit('DISCONNECTED', null);
            };
        });
    }

    handleMessage(msg: any) {
        if (msg.type === 'ROOM_CREATED' || msg.type === 'JOINED') {
            this.sessionId = msg.sessionId;
            this.roomId = msg.roomId;
        }
        this.emit(msg.type, msg);
    }

    on(type: string, handler: MessageHandler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler);
    }

    off(type: string, handler: MessageHandler) {
        const handlers = this.handlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(type: string, payload: any) {
        const handlers = this.handlers.get(type);
        if (handlers) {
            handlers.forEach(h => h(type, payload));
        }
    }

    send(type: string, payload: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...payload }));
        } else {
            console.error('WebSocket is not connected');
        }
    }

    createRoom() {
        this.send('CREATE_ROOM', {});
    }

    joinRoom(roomId: string) {
        this.send('JOIN_ROOM', { roomId });
    }

    startGame() {
        this.send('START_GAME', {});
    }

    sendAction(action: 'FLIP' | 'MOVE', payload: any) {
        this.send('ACTION', { action, payload });
    }
}
