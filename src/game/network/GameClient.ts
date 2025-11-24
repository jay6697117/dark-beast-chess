

type MessageHandler = (type: string, payload: any) => void;

export class GameClient {
    ws: WebSocket | null = null;
    handlers: Map<string, MessageHandler[]> = new Map();
    sessionId: string | null = null;
    roomId: string | null = null;

    connect(url: string = 'ws://localhost:8000/ws'): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('Connected to game server');
                resolve();
            };

            this.ws.onerror = (err) => {
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

    sendAction(action: 'FLIP' | 'MOVE', payload: any) {
        this.send('ACTION', { action, payload });
    }
}
