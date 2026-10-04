<script lang="ts">
    import type { ReplayFrame, Replay, MatchState } from '../../../src/shared/dashboard';
    import { renderBoard, snakeColor } from '../../../src/web/board';
    let { frame, replay, match, frameIndex = $bindable(), playing, analyzing, canDelete, title, subtitle,
        onplay, onseek, onstop, onanalyze, ondelete }:
        { frame?: ReplayFrame; replay?: Replay; match?: MatchState; frameIndex: number; playing: boolean; analyzing: boolean;
            canDelete: boolean; title: string; subtitle: string; onplay: () => void; onseek: (index: number) => void;
            onstop: () => void; onanalyze: () => void; ondelete: () => void } = $props();
    let weights = $state(false);
    $effect(() => {
        if (frame?.grid) {
            weights = true;
        }
    });
    const count = $derived(replay?.frames.length ?? 0);
    const details = $derived(frame ? (frame.logs.length ? frame.logs.map(line => line.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')).join('\n') : `${frame.body.you.name}\nHealth: ${frame.body.you.health}\nHead: ${frame.body.you.head.x}, ${frame.body.you.head.y}\n${frame.origin} coordinates`) : match?.logs.join('\n') || 'Start a match or open a recording to inspect each move.');
</script>
<section class="viewer">
    <div class="view-title"><div><p class="eyebrow">WATCH & INSPECT</p><h1>{title}</h1><p class="muted">{subtitle}</p></div><span class="pill" class:ready={match?.status === 'running'}>{replay ? 'Replay' : match?.status ?? 'Ready'}</span></div>
    <div class="panel board-panel">
        <div class="board-toolbar"><span>{frame ? `${frame.body.game.ruleset.name} · ${frame.body.board.width} × ${frame.body.board.height}` : 'Your next game starts here'}</span><div class="actions"><label class="check"><input type="checkbox" bind:checked={weights} />Weights</label><button onclick={onanalyze} disabled={!replay || analyzing}>{analyzing ? 'Scoring…' : 'Score board'}</button>{#if match?.status === 'running'}<button class="danger" onclick={onstop}>Stop match</button>{/if}</div></div>
        <div class="board" aria-label="Game board">
            {#if frame}
                <!-- renderBoard escapes untrusted names and is covered by SVG safety tests. -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderBoard(frame, weights)}
            {:else}<div class="board-empty"><span class="board-symbol">↗</span><h2>Make your next move.</h2><p>Choose your players, set the seed, and let them compete.</p></div>{/if}
        </div>
        <div class="playback"><button class="icon" aria-label="Previous frame" disabled={!count || frameIndex === 0} onclick={() => onseek(frameIndex - 1)}>‹</button><button disabled={count < 2} onclick={onplay}>{playing ? 'Pause' : 'Play replay'}</button><button class="icon" aria-label="Next frame" disabled={!count || frameIndex >= count - 1} onclick={() => onseek(frameIndex + 1)}>›</button><label class="timeline"><span class="sr-only">Replay frame</span><input type="range" min="0" max={Math.max(0, count - 1)} value={frameIndex} disabled={count < 2} oninput={(event) => onseek(Number(event.currentTarget.value))} /></label><span class="turn">Turn {frame?.turn ?? '—'}</span></div>
    </div>
    <div class="detail-grid"><section class="panel"><div class="section-title"><h2>On the board</h2><span class="muted">{frame?.body.board.snakes.length ?? 0} alive</span></div>{#each frame?.body.board.snakes ?? [] as snake (snake.id)}<div class="snake-stat"><div><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill={snakeColor(snake.id)} /></svg><strong>{snake.name}</strong><span>{snake.health} HP · {snake.length} long</span></div><progress max="100" value={Math.max(0, snake.health)} aria-label={`${snake.name} health`}></progress></div>{:else}<p class="empty">Health and length update each turn.</p>{/each}</section><section class="panel"><div class="section-title"><h2>Move details</h2>{#if replay && canDelete}<button class="text danger" onclick={ondelete}>Delete recording</button>{/if}</div><pre class="move-details">{details}</pre></section></div>
</section>
