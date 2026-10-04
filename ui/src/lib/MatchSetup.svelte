<script lang="ts">
    import type { SnakeEndpoint, MatchOptions, MatchState } from '../../../src/shared/dashboard';
    export type Player = SnakeEndpoint & { selected: boolean };
    let { players = $bindable(), settings = $bindable(), registered, ready, busy, matches, sockets,
        monitoring = $bindable(), onstart, onwatch, onrefresh }:
        { players: Player[]; settings: Omit<MatchOptions, 'snakes'>; registered: SnakeEndpoint[]; ready: boolean; busy: boolean;
            matches: MatchState[]; sockets: Record<string, string>; monitoring: boolean;
            onstart: () => void; onwatch: (id: string) => void; onrefresh: () => void } = $props();
    const sizes = Array.from({ length: 10 }, (_, i) => 7 + i * 2);
    function add() {
        const available = registered.find(candidate => !players.some(player => player.name === candidate.name));
        players = [...players, { ...(available ?? { name: `Snake ${players.length + 1}`, url: 'http://localhost:9013' }), selected: true }];
    }
</script>

<section class="panel setup">
    <div class="section-title"><div><p class="eyebrow">MATCH CONTROL</p><h2>Set up a match</h2></div><span class:ready class="pill">{ready ? 'Engine ready' : 'Engine unavailable'}</span></div>
    <form onsubmit={(event) => {
        event.preventDefault(); onstart();
    }}>
        <div class="fields">
            <label>Mode<select bind:value={settings.gametype}><option value="standard">Standard</option><option value="solo">Solo</option></select></label>
            <label>Seed<input type="number" step="1" required bind:value={settings.seed} /></label>
        </div>
        <div class="fields three">
            <label>Width<select bind:value={settings.width}>{#each sizes as size (size)}<option value={size}>{size}</option>{/each}</select></label>
            <label>Height<select bind:value={settings.height}>{#each sizes as size (size)}<option value={size}>{size}</option>{/each}</select></label>
            <label>Timeout (ms)<input type="number" min="10" max="5000" required bind:value={settings.timeout} /></label>
        </div>
        <div class="section-title"><h3>Players <span class="muted">{players.filter(player => player.selected).length} selected</span></h3><button type="button" class="text" onclick={add}>+ Add snake</button></div>
        <div class="players">
            {#each players as player, index (player)}
                <div class="player" class:selected={player.selected}>
                    <div class="player-heading"><label class="check"><input type="checkbox" bind:checked={player.selected} /><strong>{player.name}</strong></label><span class="socket-state" title={sockets[player.name] ?? 'Monitoring off'}>{monitoring ? (sockets[player.name] ?? 'disabled') : ''}</span><button type="button" class="icon" aria-label={`Remove ${player.name}`} onclick={() => {
                        players = players.filter((_, i) => i !== index);
                    }}>×</button></div>
                    <input type="url" aria-label={`${player.name} HTTP URL`} bind:value={player.url} required={player.selected} />
                </div>
            {/each}
        </div>
        <details><summary>Debug connections</summary><p class="hint">Enable DEBUG_WEBSOCKETS on your snake servers to inspect their live turns.</p><label class="check"><input type="checkbox" bind:checked={monitoring} />Monitor debug sockets</label>
            {#each players as player (player)}<label>{player.name} WebSocket<input type="text" bind:value={player.websocketUrl} placeholder="ws://localhost:19001" /></label>{/each}
        </details>
        <button class="primary wide" type="submit" disabled={!ready || busy}>{busy ? 'Starting…' : 'Start match'} <span>↗</span></button>
        {#if !ready}<p class="hint">Install the Rules CLI or set BATTLESNAKE_CLI, then restart the dashboard.</p>{/if}
    </form>
</section>
<section class="panel"><div class="section-title"><h2>Recent matches</h2><button class="text" onclick={onrefresh}>Refresh</button></div>
    <div class="item-list">{#each matches as match (match.id)}<button class="list-item" onclick={() => onwatch(match.id)}><strong>{match.options.snakes.map(snake => snake.name).join(' vs ')}</strong><span>{match.status} · Seed {match.options.seed} · Turn {match.frame?.turn ?? '—'}{match.winner ? ` · ${match.winner} wins` : ''}</span></button>{:else}<p class="empty">Your matches will appear here.</p>{/each}</div>
</section>
