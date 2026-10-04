import type { BTRequest } from '../types/BTData';

export interface SnakeEndpoint { name: string; url: string; websocketUrl?: string }
// Explicit ports preserve endpoint addresses when a strategy is removed.
const registeredPorts: [string, number][] = [
    ['ProjectZ', 9001], ['KeepAway', 9002], ['Rando', 9003], ['Tak', 9004],
    ['TailChase', 9005], ['Aldo', 9006], ['Dunno', 9007], ['WorkItOut', 9008],
    ['LookAhead', 9010], ['Sentinel', 9011], ['Vesper', 9012],
];
export const defaultSnakes: SnakeEndpoint[] = registeredPorts.map(([name, port]) => ({
    name, url: `http://localhost:${port}`, websocketUrl: `ws://localhost:${port + 10000}`,
}));

export interface ReplayFrame {
    turn: number;
    body: BTRequest;
    origin: 'bottom-left' | 'top-left';
    logs: unknown[][];
    grid?: Record<string, unknown>[][];
}
export interface Replay { id: string; name: string; frames: ReplayFrame[]; winner?: string }
export interface Recording { id: string; name: string; modified: string; kind: 'json' | 'snapshots' | 'match'; canDelete: boolean }
export interface MatchOptions { snakes: SnakeEndpoint[]; width: number; height: number; seed: number; timeout: number; gametype: 'standard' | 'solo' }
export interface MatchState {
    id: string; status: 'running' | 'finished' | 'stopped' | 'failed'; created: string;
    options: MatchOptions; frame?: ReplayFrame; winner?: string; error?: string; logs: string[]; recordingId: string;
}
