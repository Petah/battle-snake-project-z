import type { BTRequest } from '../types/BTData';

export interface SnakeEndpoint { name: string; url: string; websocketUrl?: string }
export const defaultSnakes: SnakeEndpoint[] = [
    'ProjectZ', 'KeepAway', 'Rando', 'Tak', 'TailChase', 'Aldo', 'Dunno', 'WorkItOut', 'ProjectZ2', 'LookAhead', 'Sentinel',
].map((name, index) => ({ name, url: `http://localhost:${9001 + index}`, websocketUrl: `ws://localhost:${19001 + index}` }));

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
