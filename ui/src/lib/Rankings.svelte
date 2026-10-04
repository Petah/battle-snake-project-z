<script lang="ts">
    import { onMount } from 'svelte';
    import type { EvaluationReport } from '../../../src/evaluation/types';
    import { comparisonKey, historyChart, historyColors, historyMetrics, historyValue } from '../../../src/shared/evaluationHistory';
    import type { EvaluationHistory, HistoryMetric } from '../../../src/shared/evaluationHistory';
    import { api, errorMessage } from './api';
    let report = $state<EvaluationReport>();
    let history = $state<EvaluationHistory>({ runs: [], skipped: 0 });
    let error = $state('');
    let busy = $state(false);
    let metric = $state<HistoryMetric>('elo');
    let selected = $state('');
    let compatible = $state(true);
    let detail = $state('Hover, focus or select a point to inspect its run.');
    const latest = $derived(history.runs.at(-1));
    const runs = $derived(history.runs.filter(run => !compatible || (latest && comparisonKey(run) === comparisonKey(latest))));
    const allNames = $derived([...new Set(history.runs.flatMap(run => run.options.snakes))].sort());
    const names = $derived(selected ? [selected] : [...new Set(runs.flatMap(run => run.options.snakes))].sort());
    const mixed = $derived(new Set(runs.map(comparisonKey)).size > 1);
    const pairings = $derived.by(() => {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local aggregate is rebuilt inside this derived value.
        const pairs = new Map<string, { players: string[]; games: number; wins: number[]; draws: number; failed: number }>();
        for (const match of report?.matches ?? []) {
            const players = [...match.players].sort(), key = JSON.stringify(players);
            const pair = pairs.get(key) ?? { players, games: 0, wins: [0, 0], draws: 0, failed: 0 };
            pairs.set(key, pair);
            if (match.status !== 'rated') {
                pair.failed++;
            } else {
                pair.games++;
                if (match.draw) {
                    pair.draws++;
                } else if (match.winner) {
                    pair.wins[players.indexOf(match.winner)]++;
                }
            }
        }
        return [...pairs.values()];
    });
    async function refresh() {
        busy = true; error = '';
        const results = await Promise.allSettled([api<EvaluationReport>('/api/evaluation/latest'), api<EvaluationHistory>('/api/evaluation/history')]);
        if (results[0].status === 'fulfilled') {
            report = results[0].value;
        } else {
            report = undefined; error = errorMessage(results[0].reason);
        }
        if (results[1].status === 'fulfilled') {
            history = results[1].value;
        } else {
            error = [error, errorMessage(results[1].reason)].filter(Boolean).join(' ');
        }
        busy = false;
    }
    function inspectPoints(node: HTMLElement) {
        const inspect = (event: Event) => {
            const target = event.target instanceof Element ? event.target.closest('[data-detail]') : null;
            if (target) {
                detail = target.getAttribute('data-detail') ?? '';
            }
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); inspect(event);
            }
        };
        node.addEventListener('pointerover', inspect); node.addEventListener('focusin', inspect); node.addEventListener('click', inspect); node.addEventListener('keydown', key);
        return { destroy() {
            node.removeEventListener('pointerover', inspect); node.removeEventListener('focusin', inspect); node.removeEventListener('click', inspect); node.removeEventListener('keydown', key);
        } };
    }
    onMount(() => {
        void refresh();
    });
</script>

<div class="rankings">
    <div class="view-title"><div><p class="eyebrow">COMPARE & IMPROVE</p><h1>Local snake rankings</h1><p class="muted">{report ? `${report.rated}/${report.scheduled} rated duels · ${report.options.width} × ${report.options.height} · Revision ${report.revision}` : 'Measure progress across repeatable local games.'}</p></div><button onclick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh rankings'}</button></div>
    {#if error}<p class="notice" role="status">{error}</p>{/if}
    <section class="panel"><div class="section-title"><div><h2>Progress across runs</h2><p class="hint">Compare final ratings, results and move latency.</p></div><code>npm run evaluate</code></div>
        <div class="fields"><label>Statistic<select aria-label="Statistic" bind:value={metric}>{#each Object.entries(historyMetrics) as [value, label] (value)}<option {value}>{label}</option>{/each}</select></label><label>Snake<select aria-label="Snake" bind:value={selected}><option value="">All snakes</option>{#each allNames as name (name)}<option value={name}>{name}</option>{/each}</select></label></div>
        <label class="check"><input type="checkbox" bind:checked={compatible} />Match the latest run’s opponents, seeds and settings</label>
        <p class="hint">{runs.length} of {history.runs.length} saved completed runs shown.{runs.length < 2 ? ' Run another evaluation with the same settings to see a trend.' : ''}{history.skipped ? ` ${history.skipped} unreadable reports skipped.` : ''}</p>
        {#if mixed}<p class="notice">Mixed settings: these runs use different opponents, seeds, engines or budgets and are not directly comparable.</p>{/if}
        <!-- The shared SVG renderer escapes labels and is covered by injection tests. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="history-chart" use:inspectPoints>{@html historyChart(runs, names, metric)}</div>
        <div class="legend">{#each names as name, index (name)}<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill={historyColors[index % historyColors.length]} /></svg>{name}</span>{/each}</div>
        <p class="hint" aria-live="polite">{detail}</p>
        <p class="hint">Elo resets to 1500 each run. Opponent code, random choices and machine load can affect results. Missing measurements appear as gaps. History retains the newest 20 completed reports.</p>
        <details><summary>Compared runs and values</summary><div class="table-scroll"><table><thead><tr><th>Run</th><th>Revision</th><th>Rated</th><th>Settings / opponents</th><th>{historyMetrics[metric]}</th></tr></thead><tbody>{#each runs as run, index (run.id)}<tr><td>#{index + 1} · {new Date(run.finished).toLocaleString()}</td><td><code>{run.revision}</code></td><td>{run.rated}/{run.scheduled}</td><td>{run.options.width}×{run.options.height} · seed {run.options.seed} · {run.options.rounds} rounds · {run.options.timeout} ms/move · {run.options.maxSeconds} s/game · concurrency {run.options.concurrency}<br />{run.options.snakes.join(', ')}</td><td>{#each names as name (name)}{@const row = run.rankings.find(row => row.name === name)}{@const value = row ? historyValue(row, metric) : null}<div>{name}: {value === null ? '—' : value.toFixed(1)}</div>{/each}</td></tr>{/each}</tbody></table></div></details>
    </section>
    <section class="panel"><div class="section-title"><h2>Latest standings</h2><span class="muted">{report ? new Date(report.finished).toLocaleString() : 'No completed evaluation'}</span></div><div class="table-scroll"><table><thead><tr><th>Snake</th><th>Elo</th><th>Games</th><th>W / D / L</th><th>Score</th><th>P95 ms</th><th>Failed</th></tr></thead><tbody>{#each report?.rankings ?? [] as row (row.name)}<tr><td><strong>{row.name}</strong>{row.games < 20 ? ' *' : ''}</td><td class="rating">{row.elo.toFixed(1)}</td><td>{row.games}</td><td>{row.wins} / {row.draws} / {row.losses}</td><td>{row.games ? `${(100 * (row.wins + row.draws / 2) / row.games).toFixed(1)}%` : '—'}</td><td>{row.moveCount ? row.p95Ms : '—'}</td><td>{row.failed}</td></tr>{/each}</tbody></table></div><p class="hint">* Provisional: fewer than 20 rated games. Failed and unfinished matches are excluded from Elo.</p></section>
    <section class="panel"><h2>Results by pairing</h2><div class="table-scroll"><table><thead><tr><th>Players</th><th>Games</th><th>First wins</th><th>Draws</th><th>Second wins</th><th>Failed</th></tr></thead><tbody>{#each pairings as pair (pair.players.join("/"))}<tr><td>{pair.players.join(' vs ')}</td><td>{pair.games}</td><td>{pair.wins[0]}</td><td>{pair.draws}</td><td>{pair.wins[1]}</td><td>{pair.failed}</td></tr>{/each}</tbody></table></div></section>
</div>
