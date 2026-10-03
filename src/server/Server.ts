import express, { Request, Response, NextFunction } from 'express';
import * as http from 'node:http';
const logger = require('morgan');

import { log, logs } from '../lib/log';
import { writeFile, writeTurnFile } from '../lib/writeFile';
import { StrategyRequest, BTRequest, SnakeAppearance } from '../types/BTData';
import { MoveDirection } from '../types/MoveDirection';
import { fallbackMove, isDirection, nextPosition } from '../lib/directions';
import { isFree, isHeadThreat } from '../lib/isFree';
import { genericErrorHandler } from './handlers';
import { validateRequest } from './validateRequest';
import { WebSocketServer } from './WebSocketServer';

export interface ServerMoveResponse {
    move: MoveDirection;
    shout?: string;
}

export interface Snake {
    info: { name: string; ops?: string[] };
    appearance: SnakeAppearance;
    start: (data: StrategyRequest) => void;
    move: (data: StrategyRequest) => { move?: unknown; shout?: string };
    end?: (data: StrategyRequest) => void;
}

export interface ServerOptions {
    saveGame?: boolean;
    debugWebSockets?: boolean;
    recordingDirectory?: string;
    host?: string;
    author?: string;
    version?: string;
}

interface GameRecording {
    apiVersion: '1';
    coordinateSystem: 'bottom-left';
    snake: string;
    start: BTRequest;
    moves: BTRequest[];
    end?: BTRequest;
}

interface GameState {
    snake: Snake;
    storage: Record<string, any>;
    recording?: GameRecording;
}

export class Server {
    public readonly httpServer: http.Server;
    public readonly webSocketServer?: WebSocketServer;
    private readonly games = new Map<string, GameState>();
    private readonly template: Snake;

    constructor(
        port: number,
        private readonly createSnake: () => Snake,
        private readonly options: ServerOptions = {},
    ) {
        this.template = createSnake();
        if (options.debugWebSockets) {
            this.webSocketServer = new WebSocketServer(port, this.template);
        }
        const app = express();
        app.use(logger('dev', { skip: (_request, response) => process.env.NODE_ENV === 'test' ||
            (process.env.NODE_ENV === 'production' && process.env.REQUEST_LOGS !== 'true' && response.statusCode < 400) }));
        app.use(express.json());

        app.get('/', (_request: Request, response: Response) => {
            response.json({
                apiversion: '1',
                ...this.template.appearance,
                ...(options.author ? { author: options.author } : {}),
                version: options.version ?? require('../../package.json').version,
            });
        });

        app.post('/start', (request: Request, response: Response, next: NextFunction) => {
            logs.splice(0);
            try {
                const data = validateRequest(request.body);
                const game = this.game(data);
                this.broadcast('start', game.snake, data);
                response.json({});
            } catch (error) {
                next(error);
            } finally {
                logs.splice(0);
            }
        });

        app.post('/move', (request: Request, response: Response, next: NextFunction) => {
            logs.splice(0);
            try {
                const requestData = validateRequest(request.body);
                let game: GameState | undefined;
                let result: { move?: unknown; shout?: string } | undefined;
                let context: StrategyRequest | undefined;
                try {
                    game = this.game(requestData);
                    context = this.context(requestData, game.storage);
                    result = game.snake.move(context);
                } catch (error) {
                    console.error('Strategy failed; using fallback move:', error);
                }
                const position = isDirection(result?.move) ? nextPosition(requestData.you.head, result.move) : undefined;
                const move: ServerMoveResponse = {
                    move: position && isFree(requestData, position.x, position.y) && !isHeadThreat(requestData, position.x, position.y)
                        ? result.move as MoveDirection : fallbackMove(requestData),
                };
                if (typeof result?.shout === 'string') move.shout = result.shout.slice(0, 256);
                log('moveResponse', move);
                if (game?.recording && context) {
                    context.log('moveResponse', move);
                    this.recordTurn(game.snake, 'move', context);
                }
                if (game?.recording) game.recording.moves[requestData.turn] = structuredClone(requestData);
                this.broadcast('move', game?.snake ?? this.template, requestData);
                response.json(move);
            } catch (error) {
                next(error);
            } finally {
                logs.splice(0);
            }
        });

        app.post('/end', (request: Request, response: Response, next: NextFunction) => {
            logs.splice(0);
            try {
                const data = validateRequest(request.body);
                const key = this.key(data);
                const game = this.games.get(key);
                try {
                    const context = this.context(data, game?.storage);
                    game?.snake.end?.(context);
                    if (game?.recording) {
                        this.recordTurn(game.snake, 'end', context);
                        game.recording.end = structuredClone(data);
                        const filename = `${encodeURIComponent(data.game.id)}-${encodeURIComponent(data.you.id)}`;
                        writeFile(filename, game.recording, options.recordingDirectory);
                    }
                    this.broadcast('end', game?.snake ?? this.template, data);
                } finally {
                    this.games.delete(key);
                }
                response.json({});
            } catch (error) {
                next(error);
            } finally {
                logs.splice(0);
            }
        });

        // Retained for the legacy local dashboard; current engine probes use GET /.
        app.post('/ping', (_request: Request, response: Response) => response.json({}));
        app.get('/favicon.ico', (_request: Request, response: Response) => response.status(204).end());
        app.use((_request: Request, response: Response) => response.status(404).json({ status: 404, error: 'Not found' }));
        app.use(genericErrorHandler);

        this.httpServer = app.listen(port, options.host ?? '0.0.0.0', () => {
            const address = this.httpServer.address();
            console.log('Server listening on port %s (%s)', typeof address === 'object' ? address?.port : port, this.template.info.name);
        });
    }

    private key(data: BTRequest): string {
        return JSON.stringify([data.game.id, data.you.id]);
    }

    private context(data: BTRequest, storage: Record<string, any> = {}): StrategyRequest {
        return new StrategyRequest(data, storage);
    }

    private game(data: BTRequest): GameState {
        const key = this.key(data);
        let game = this.games.get(key);
        if (!game) {
            const snake = this.createSnake();
            const storage = {};
            const context = this.context(data, storage);
            snake.start(context);
            game = { snake, storage };
            if (this.options.saveGame) {
                this.recordTurn(snake, 'start', context);
                game.recording = {
                    apiVersion: '1', coordinateSystem: 'bottom-left', snake: snake.info.name,
                    start: structuredClone(data), moves: [],
                };
            }
            this.games.set(key, game);
        }
        return game;
    }

    private recordTurn(snake: Snake, type: 'start' | 'move' | 'end', context: StrategyRequest): void {
        // Optional debug I/O must not prevent the engine from receiving a move.
        try {
            writeTurnFile(snake.info.name, type, context, this.options.recordingDirectory);
        } catch (error) {
            console.error('Debug recording failed:', error);
        }
    }

    private broadcast(event: string, snake: Snake, data: BTRequest): void {
        try {
            this.webSocketServer?.broadcast(event, { snake: snake.info, body: { ...data, log: [...logs] } });
        } catch (error) {
            console.error('Debug broadcast failed:', error);
        }
    }

    public async close(): Promise<void> {
        await this.webSocketServer?.close();
        this.games.clear();
        this.httpServer.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            this.httpServer.close(error => error ? reject(error) : resolve());
        });
    }
}
