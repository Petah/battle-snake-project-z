import type { Rating } from './ratings';
export interface EvaluationOptions {
    snakes: string[]; rounds: number; seed: number; width: number; height: number;
    timeout: number; concurrency: number; maxSeconds: number; keepReplays: boolean;
}
export interface Duel { index: number; round: number; seed: number; players: [string, string] }
export interface Latency { count: number; total: number; max: number; histogram: Record<string, number> }
export interface MatchResult extends Duel {
    status: 'rated' | 'failed' | 'cancelled'; winner?: string; draw?: boolean;
    turns: number; durationMs: number; error?: string; latency: Record<string, Latency>;
}
export interface Standing extends Rating { failed: number; averageMs: number; p95Ms: number; maxMs: number; moveCount: number }
export interface EvaluationReport {
    formatVersion: 1; id: string; started: string; finished: string;
    options: EvaluationOptions; revision: string; cliVersion: string;
    status: 'finished' | 'cancelled'; scheduled: number; completed: number; rated: number;
    rankings: Standing[]; matches: MatchResult[];
}
