import type { SnakeEndpoint, ReplayFrame } from '../shared/dashboard';
import { normalizeFrame } from '../shared/replay';

type SocketState = 'connected' | 'retrying' | 'disabled';
export class SocketMonitor {
    private sockets: WebSocket[] = [];
    private timers = new Set<ReturnType<typeof setTimeout>>();
    private generation = 0;
    constructor(private status: (name: string, state: SocketState) => void, private frame: (value: ReplayFrame, name: string) => void) {}
    start(snakes: SnakeEndpoint[]) {
        this.close();
        const generation = this.generation;
        for (const snake of snakes) {
            if (!snake.websocketUrl) { this.status(snake.name, 'disabled'); continue; }
            let attempt = 0;
            const connect = () => {
                if (generation !== this.generation) return;
                let socket: WebSocket;
                try { socket = new WebSocket(snake.websocketUrl); }
                catch { this.status(snake.name, 'disabled'); return; }
                this.sockets.push(socket);
                this.status(snake.name, 'retrying');
                socket.onopen = () => { attempt = 0; this.status(snake.name, 'connected'); };
                socket.onmessage = event => {
                    try {
                        const message = JSON.parse(event.data);
                        const frame = normalizeFrame(message.data?.body);
                        if (frame) this.frame(frame, snake.name);
                    } catch { /* Bad debug frames must not interrupt replay controls. */ }
                };
                socket.onerror = () => socket.close();
                socket.onclose = () => {
                    this.sockets = this.sockets.filter(item => item !== socket);
                    if (generation !== this.generation) return;
                    this.status(snake.name, 'retrying');
                    const timer = setTimeout(() => { this.timers.delete(timer); connect(); }, Math.min(30000, 1000 * 2 ** attempt++));
                    this.timers.add(timer);
                };
            };
            connect();
        }
    }
    close() {
        this.generation++;
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        for (const socket of this.sockets) { socket.onclose = null; socket.onmessage = null; socket.onopen = null; socket.onerror = null; socket.close(); }
        this.sockets = [];
    }
}
