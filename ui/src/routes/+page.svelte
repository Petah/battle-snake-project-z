<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import MatchSetup from '#lib/MatchSetup.svelte';
    import Viewer from '#lib/Viewer.svelte';
    import Recordings from '#lib/Recordings.svelte';
    import Rankings from '#lib/Rankings.svelte';
    import { api, errorMessage } from '#lib/api.ts';
    import { SocketMonitor } from '../../../src/web/SocketMonitor';
    import type { MatchOptions, MatchState, Recording, Replay, ReplayFrame, SnakeEndpoint } from '../../../src/shared/dashboard';

    type Player = SnakeEndpoint & { selected: boolean };
    let tab = $state<'play' | 'recordings' | 'rankings'>('play');
    let players = $state<Player[]>([]);
    let registered = $state<SnakeEndpoint[]>([]);
    let settings = $state<Omit<MatchOptions, 'snakes'>>({ width: 11, height: 11, seed: 42, timeout: 500, gametype: 'standard' });
    let ready = $state(false), initialized = $state(false), busy = $state(false), analyzing = $state(false);
    let message = $state(''), loading = $state('');
    let recordings = $state<Recording[]>([]), matches = $state<MatchState[]>([]);
    let replay = $state<Replay>(), match = $state<MatchState>(), debugFrame = $state<ReplayFrame>();
    let frameIndex = $state(0), playing = $state(false), monitoring = $state(false);
    let sockets = $state<Record<string, string>>({});
    let stream: EventSource | undefined, timer: ReturnType<typeof setInterval> | undefined, monitor: SocketMonitor | undefined;
    let generation = 0;
    const frame = $derived(replay?.frames[frameIndex] ?? match?.frame ?? debugFrame);
    const title = $derived(loading || (replay ? (replay.winner ? (replay.winner === 'Draw' ? 'A draw.' : `${replay.winner} wins.`) : 'Replay the game.') : match ? (match.status === 'running' ? 'The game is on.' : `Match ${match.status}.`) : debugFrame ? 'Live debug view' : 'Ready when you are.'));
    const subtitle = $derived(replay?.name ?? (match ? `${match.options.snakes.map(snake => snake.name).join(' vs ')} · Seed ${match.options.seed}` : 'Start a match, explore a replay, or compare your snakes.'));
    const canDelete = $derived(!!replay && recordings.some(recording => recording.id === replay?.id && recording.canDelete));
    function handle(action: () => Promise<unknown>) {
        message = '';
        void action().catch(error => {
            message = errorMessage(error);
        });
    }
    function stopPlayback() {
        clearInterval(timer); timer = undefined; playing = false;
    }
    function reset() {
        generation++; stream?.close(); stream = undefined; stopPlayback(); replay = undefined; match = undefined; debugFrame = undefined; frameIndex = 0; loading = ''; analyzing = false;
    }
    async function recordingUrl(id?: string) {
        const url = new URL(page.url.href);
        if (id) {
            url.searchParams.set('recording', id);
        } else {
            url.searchParams.delete('recording');
        }
        await goto(url.pathname + url.search, { replace: true, shallow: true, reset: false });
    }
    async function refreshRecordings() {
        recordings = await api<Recording[]>('/api/recordings');
    }
    async function refreshMatches() {
        matches = await api<MatchState[]>('/api/matches');
    }
    async function loadReplay(id: string, updateUrl = true) {
        reset(); const current = generation; loading = 'Loading recording…';
        try {
            const loaded = await api<Replay>(`/api/recordings/${encodeURIComponent(id)}`);
            if (current !== generation) {
                return;
            }
            replay = loaded;
            if (updateUrl) {
                await recordingUrl(id);
            }
        } finally {
            if (current === generation) {
                loading = '';
            }
        }
    }
    async function showMatch(state: MatchState, current: number) {
        if (current !== generation) {
            return;
        }
        match = state;
        if (state.error) {
            message = state.error;
        }
        if (state.status !== 'running') {
            stream?.close(); stream = undefined;
            await Promise.all([refreshMatches(), refreshRecordings()]);
            if (current === generation && state.frame && state.status !== 'failed') {
                await loadReplay(state.recordingId);
            }
        }
    }
    async function watch(id: string) {
        reset(); const current = generation;
        await recordingUrl();
        const state = await api<MatchState>(`/api/matches/${encodeURIComponent(id)}`);
        if (current !== generation) {
            return;
        }
        await showMatch(state, current);
        if (state.status !== 'running' || current !== generation) {
            return;
        }
        stream = new EventSource(`/api/matches/${encodeURIComponent(id)}/events`);
        stream.onmessage = event => {
            if (current === generation) {
                handle(() => showMatch(JSON.parse(event.data), current));
            }
        };
        stream.onerror = () => {
            if (current === generation) {
                message = 'Live updates disconnected. Reconnecting…';
            }
        };
    }
    async function start() {
        busy = true;
        try {
            const state = await api<MatchState>('/api/matches', { method: 'POST', body: JSON.stringify({ ...settings, snakes: players.filter(player => player.selected) }) });
            await refreshMatches(); await watch(state.id);
        } finally {
            busy = false;
        }
    }
    async function stop() {
        if (!match) {
            return;
        }
        const current = generation;
        await showMatch(await api<MatchState>(`/api/matches/${match.id}/stop`, { method: 'POST', body: '{}' }), current);
    }
    function seek(index: number) {
        stopPlayback(); frameIndex = Math.max(0, Math.min(index, (replay?.frames.length ?? 1) - 1));
    }
    function play() {
        if (playing) {
            stopPlayback(); return;
        }
        if (!replay || replay.frames.length < 2) {
            return;
        }
        if (frameIndex >= replay.frames.length - 1) {
            frameIndex = 0;
        }
        playing = true;
        timer = setInterval(() => {
            frameIndex++;
            if (!replay || frameIndex >= replay.frames.length - 1) {
                stopPlayback();
            }
        }, 120);
    }
    async function analyze() {
        if (!replay) {
            return;
        }
        const id = replay.id, index = frameIndex, current = generation;
        analyzing = true;
        try {
            const grid = await api<Record<string, unknown>[][]>(`/api/recordings/${encodeURIComponent(id)}/analyze`, { method: 'POST', body: JSON.stringify({ frame: index }) });
            if (current === generation && replay?.id === id) {
                replay.frames[index].grid = grid;
            }
        } finally {
            if (current === generation) {
                analyzing = false;
            }
        }
    }
    async function removeRecording() {
        if (!replay || !canDelete || !confirm(`Delete only this recording?\n\n${replay.name}\n\nThis cannot be undone.`)) {
            return;
        }
        const id = replay.id, current = generation;
        await api(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (current === generation) {
            reset(); await recordingUrl();
        }
        await refreshRecordings();
    }
    async function initialize() {
        const config = await api<{ snakes: SnakeEndpoint[]; cliAvailable: boolean }>('/api/config');
        registered = config.snakes; ready = config.cliAvailable;
        let stored;
        try {
            stored = JSON.parse(localStorage.getItem('project-z-dashboard') ?? 'null');
        } catch { /* Storage is optional. */ }
        players = Array.isArray(stored?.snakes) && stored.snakes.length && stored.snakes.every((snake: Player) => typeof snake.name === 'string' && typeof snake.url === 'string') ? stored.snakes : config.snakes.map((snake, index) => ({ ...snake, selected: index < 2 }));
        for (const key of ['width', 'height', 'seed', 'timeout'] as const) {
            if (stored?.[key] !== undefined && Number.isFinite(Number(stored[key]))) {
                settings[key] = Number(stored[key]);
            }
        }
        if (stored?.gametype === 'standard' || stored?.gametype === 'solo') {
            settings.gametype = stored.gametype;
        }
        initialized = true;
        await Promise.all([refreshRecordings(), refreshMatches()]);
        const id = page.url.searchParams.get('recording');
        if (id) {
            tab = 'recordings'; await loadReplay(id, false);
        }
    }
    $effect(() => {
        if (initialized) {
            const value = JSON.stringify({ snakes: players, ...settings });
            try {
                localStorage.setItem('project-z-dashboard', value);
            } catch { /* Storage is optional. */ }
        }
    });
    $effect(() => {
        const endpoints = players.filter(player => player.selected).map(player => ({ name: player.name, url: player.url, websocketUrl: player.websocketUrl }));
        if (initialized && monitoring) {
            monitor?.start(endpoints);
        } else {
            monitor?.close();
        }
        return () => monitor?.close();
    });
    onMount(() => {
        monitor = new SocketMonitor((name, state) => {
            sockets[name] = state;
        }, value => {
            if (!match && !replay) {
                debugFrame = value;
            }
        });
        handle(initialize);
        return () => {
            generation++; monitor?.close(); stream?.close(); stopPlayback();
        };
    });
</script>

<svelte:head><title>Project Z · Local arena</title><meta name="description" content="Run Battlesnake matches, inspect replays, and compare local rankings." /></svelte:head>
<div class="app-shell">
    <header class="masthead"><a class="brand" href="/"><span class="brand-mark">Z</span><span>PROJECT Z<small>LOCAL ARENA</small></span></a><nav aria-label="Workspace">{#each ['play', 'recordings', 'rankings'] as name (name)}<button class:active={tab === name} aria-current={tab === name ? 'page' : undefined} onclick={() => {
        tab = name as typeof tab; stopPlayback(); if (name === 'recordings') {
            handle(refreshRecordings);
        }
    }}>{name === 'play' ? 'Play' : name === 'recordings' ? 'Recordings' : 'Rankings'}</button>{/each}</nav><span class="environment">LOCAL WORKSPACE</span></header>
    <main>
        {#if message}<div class="notice" role="status"><span>{message}</span><button class="icon" aria-label="Dismiss message" onclick={() => {
            message = '';
        }}>×</button></div>{/if}
        {#if tab === 'rankings'}<Rankings />{:else}<div class="workspace"><aside>{#if tab === 'play'}<MatchSetup bind:players bind:settings {registered} {ready} {busy} {matches} {sockets} bind:monitoring onstart={() => handle(start)} onwatch={(id) => handle(() => watch(id))} onrefresh={() => handle(refreshMatches)} />{:else}<Recordings {recordings} selected={replay?.id} onopen={(id) => handle(() => loadReplay(id))} onrefresh={() => handle(refreshRecordings)} />{/if}</aside><Viewer {frame} {replay} {match} bind:frameIndex {playing} {analyzing} {canDelete} {title} {subtitle} onplay={play} onseek={seek} onstop={() => handle(stop)} onanalyze={() => handle(analyze)} ondelete={() => handle(removeRecording)} /></div>{/if}
    </main>
    <footer><span>PROJECT Z / BATTLESNAKE LAB</span><span>STANDARD GAMES · API V1</span></footer>
</div>
