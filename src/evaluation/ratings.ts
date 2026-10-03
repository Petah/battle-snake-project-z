export interface Rating { name: string; elo: number; games: number; wins: number; draws: number; losses: number }
export interface DuelResult { players: [string, string]; winner?: string; draw?: boolean }
export function applyElo(ratings: Map<string, Rating>, result: DuelResult, k = 32): void {
    const [a, b] = result.players.map(name => ratings.get(name));
    if (!a || !b || a === b || (!result.draw && !result.players.includes(result.winner))) throw new Error('Invalid rated duel result.');
    const score = result.draw ? 0.5 : result.winner === a.name ? 1 : 0;
    const expected = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
    const change = k * (score - expected);
    a.elo += change; b.elo -= change; a.games++; b.games++;
    if (result.draw) { a.draws++; b.draws++; }
    else { const winner = score ? a : b; const loser = score ? b : a; winner.wins++; loser.losses++; }
}
