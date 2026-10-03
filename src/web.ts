import type { MatchOptions, MatchState, Recording, Replay, ReplayFrame, SnakeEndpoint } from './shared/dashboard';
import { renderBoard, snakeColor } from './web/board';
import type { EvaluationReport } from './evaluation/types';
import { EvaluationHistoryView } from './evaluationHistoryView';
import { SocketMonitor } from './web/SocketMonitor';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => element<HTMLButtonElement>(id);
const input = (id: string) => element<HTMLInputElement>(id);
let snakes: (SnakeEndpoint & { selected: boolean })[] = [];
let recordings: Recording[] = [];
let replay: Replay;
let frameIndex = 0;
let match: MatchState;
let stream: EventSource;
let playback: ReturnType<typeof setInterval>;
let viewGeneration = 0;
const monitor = new SocketMonitor((name, state) => {
    const row = [...document.querySelectorAll<HTMLElement>('.player')].find(item => item.dataset.name === name);
    const dot = row?.querySelector<HTMLElement>('.socket-dot');
    if (dot) { dot.className = `socket-dot ${state}`; dot.title = state === 'connected' ? 'Debug socket connected' : state === 'retrying' ? 'Disconnected · retrying' : 'Monitoring off'; }
}, (frame, name) => {
    if (!match && !replay) { element('view-title').textContent = name; element('view-subtitle').textContent = 'Live debug socket'; renderFrame(frame); }
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
    return body;
}
function notice(message = '') { element('notice').textContent = message; element('notice').hidden = !message; }
function handle(action: () => Promise<unknown>) { void action().catch(error => notice(error.message)); }
function saved() {
    try { return JSON.parse(localStorage.getItem('project-z-dashboard') ?? 'null'); } catch { return null; }
}
function persist() {
    try { localStorage.setItem('project-z-dashboard', JSON.stringify({ snakes, width: input('width').value, height: input('height').value, seed: input('seed').value, timeout: input('timeout').value, gametype: input('gametype').value })); }
    catch { /* The dashboard remains usable when browser storage is unavailable. */ }
}
function stopPlayback() { clearInterval(playback); playback = undefined; button('playback-toggle').textContent = 'Play replay'; }
function resetView() { const url = new URL(location.href); url.searchParams.delete('recording'); history.replaceState(null, '', url); viewGeneration++; stream?.close(); stream = undefined; stopPlayback(); match = undefined; replay = undefined; button('stop-match').hidden = true; button('delete-recording').hidden = true; button('analyze').disabled = true; }

function renderPlayers() {
    const list = element('players'); list.replaceChildren();
    const sockets = element('socket-settings'); sockets.replaceChildren();
    snakes.forEach((snake, index) => {
        const row = document.createElement('div'); row.className = 'player'; row.dataset.name = snake.name;
        const title = document.createElement('label'); title.className = 'player-title';
        const selected = document.createElement('input'); selected.type = 'checkbox'; selected.checked = snake.selected; selected.setAttribute('aria-label', `Play ${snake.name}`);
        selected.onchange = () => { snake.selected = selected.checked; persist(); reconnect(); };
        const name = document.createElement('strong'); name.textContent = snake.name;
        const dot = document.createElement('span'); dot.className = 'socket-dot'; dot.title = 'Monitoring off';
        title.append(selected, name, dot); row.append(title);
        const url = document.createElement('input'); url.type = 'url'; url.className = 'url'; url.value = snake.url; url.setAttribute('aria-label', `${snake.name} HTTP URL`);
        url.onchange = () => { snake.url = url.value; persist(); }; row.append(url); list.append(row);
        const label = document.createElement('label'); label.textContent = `${snake.name} WebSocket`;
        const socket = document.createElement('input'); socket.type = 'text'; socket.value = snake.websocketUrl ?? ''; socket.placeholder = 'ws://localhost:19001';
        socket.onchange = () => { snake.websocketUrl = socket.value; persist(); reconnect(); }; label.append(socket); sockets.append(label);
        if (index >= 10) {
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${snake.name}`);
            remove.onclick = event => { event.preventDefault(); snakes.splice(index, 1); renderPlayers(); persist(); reconnect(); }; title.append(remove);
        }
    });
}
function reconnect() {
    monitor.close();
    document.querySelectorAll<HTMLElement>('.socket-dot').forEach(dot => { dot.className = 'socket-dot'; dot.title = 'Monitoring off'; });
    if (input('monitor').checked) monitor.start(snakes.filter(snake => snake.selected));
}

function renderFrame(frame: ReplayFrame) {
    element('board').innerHTML = renderBoard(frame, input('show-weights').checked);
    element('board-meta').textContent = `${frame.body.game.ruleset.name.toUpperCase()} · ${frame.body.board.width} × ${frame.body.board.height}`;
    element('turn-label').textContent = `TURN ${frame.turn}`;
    element('survivors').textContent = `${frame.body.board.snakes.length} ALIVE`;
    const stats = element('snake-stats'); stats.replaceChildren();
    for (const snake of frame.body.board.snakes) {
        const row = document.createElement('div'); row.className = 'stat';
        const color = document.createElement('i'); color.style.backgroundColor = snakeColor(snake.id);
        const name = document.createElement('strong'); name.textContent = snake.name;
        const value = document.createElement('span'); value.textContent = `${snake.health} HP · ${snake.length} LONG`;
        const bar = document.createElement('div'); bar.className = 'health'; const fill = document.createElement('b'); fill.style.width = `${Math.max(0, Math.min(100, snake.health))}%`; bar.append(fill);
        row.append(color, name, value, bar); stats.append(row);
    }
    element('move-log').textContent = frame.logs.length ? frame.logs.map(line => line.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')).join('\n') : `${frame.body.you.name}\nHealth: ${frame.body.you.health}\nHead: ${frame.body.you.head.x}, ${frame.body.you.head.y}\n${frame.origin} coordinates`;
}
function updatePlayback() {
    const count = replay?.frames.length ?? 0;
    input('timeline').max = String(Math.max(0, count - 1)); input('timeline').value = String(frameIndex); input('timeline').disabled = count < 2;
    button('previous').disabled = !count || frameIndex === 0; button('next').disabled = !count || frameIndex === count - 1; button('playback-toggle').disabled = count < 2;
    if (replay?.frames[frameIndex]) renderFrame(replay.frames[frameIndex]);
}
async function loadReplay(id: string) {
    resetView(); const generation = viewGeneration;
    notice(); element('view-title').textContent = 'Loading recording…';
    const loaded = await api<Replay>(`/api/recordings/${encodeURIComponent(id)}`);
    if (generation !== viewGeneration) return;
    replay = loaded; frameIndex = 0;
    element('view-title').textContent = loaded.winner ? `${loaded.winner === 'Draw' ? 'A draw.' : `${loaded.winner} wins.`}` : 'Replay the game.';
    element('view-subtitle').textContent = loaded.name;
    element('view-status').textContent = 'REPLAY'; element('view-status').className = 'status';
    button('analyze').disabled = false; button('delete-recording').hidden = recordings.find(recording => recording.id === id)?.canDelete === false;
    updatePlayback();
    const url = new URL(location.href); url.searchParams.set('recording', id); history.replaceState(null, '', url);
}
async function refreshRecordings() {
    recordings = await api<Recording[]>('/api/recordings'); renderRecordings();
}
function renderRecordings() {
    const list = element('recordings'); list.replaceChildren();
    const filter = input('recording-search').value.toLowerCase();
    for (const recording of recordings.filter(item => item.name.toLowerCase().includes(filter))) {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'recording-item';
        const name = document.createElement('strong'); name.textContent = recording.name;
        const detail = document.createElement('small'); detail.textContent = `${recording.kind === 'snapshots' ? 'Snake snapshots' : recording.kind === 'match' ? 'CLI match' : 'Game recording'} · ${new Date(recording.modified).toLocaleString()}`;
        item.append(name, detail); item.onclick = () => handle(() => loadReplay(recording.id)); list.append(item);
    }
    if (!list.children.length) { const empty = document.createElement('p'); empty.className = 'empty-note'; empty.textContent = 'No recordings found. Completed local matches are saved automatically.'; list.append(empty); }
}
async function refreshMatches() {
    const matches = await api<MatchState[]>('/api/matches'); const list = element('matches'); list.replaceChildren();
    for (const state of matches) {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'match-item';
        const title = document.createElement('strong'); title.textContent = state.winner ? `${state.winner} · ${state.status}` : state.options.snakes.map(snake => snake.name).join(' vs ');
        const detail = document.createElement('small'); detail.textContent = `${state.status.toUpperCase()} · Seed ${state.options.seed} · ${state.frame ? `Turn ${state.frame.turn}` : 'Starting'}`;
        item.append(title, detail); item.onclick = () => handle(() => watch(state.id)); list.append(item);
    }
}
function showMatch(state: MatchState) {
    match = state;
    element('view-title').textContent = state.status === 'finished' ? (state.winner === 'Draw' ? 'A draw.' : `${state.winner ?? 'Match'}${state.winner ? ' wins.' : ' finished.'}`) : state.status === 'running' ? 'Let them battle.' : `Match ${state.status}.`;
    element('view-subtitle').textContent = `${state.options.snakes.map(snake => snake.name).join(' vs ')} · Seed ${state.options.seed}`;
    element('view-status').textContent = state.status.toUpperCase(); element('view-status').className = `status ${state.status}`;
    button('stop-match').hidden = state.status !== 'running';
    if (state.frame) renderFrame(state.frame);
    else element('move-log').textContent = state.logs.join('\n') || 'Waiting for the first turn…';
    if (state.error) notice(state.error);
    if (state.status !== 'running') {
        stream?.close(); stream = undefined;
        const generation = viewGeneration;
        handle(async () => { await refreshMatches(); await refreshRecordings(); if (generation === viewGeneration && state.frame && state.status !== 'failed') await loadReplay(state.recordingId); });
    }
}
async function watch(id: string) {
    resetView(); notice(); updatePlayback(); const generation = viewGeneration;
    const state = await api<MatchState>(`/api/matches/${id}`);
    if (generation !== viewGeneration) return;
    showMatch(state);
    if (state.status !== 'running') return;
    stream = new EventSource(`/api/matches/${id}/events`);
    stream.onmessage = event => { if (generation === viewGeneration) { notice(); showMatch(JSON.parse(event.data)); } };
    stream.onerror = () => { if (generation === viewGeneration) notice('Live updates disconnected. Reconnecting…'); };
}
let evaluationHistoryView: EvaluationHistoryView;
async function refreshRankings() {
    evaluationHistoryView ??= new EvaluationHistoryView();
    await evaluationHistoryView.refresh();
    let report: EvaluationReport;
    try { report = await api<EvaluationReport>('/api/evaluation/latest'); }
    catch (error) { element('evaluation-summary').textContent = error.message; return; }
    element('evaluation-summary').textContent = `${report.rated}/${report.scheduled} rated duels · ${report.options.width} × ${report.options.height} · ${report.options.rounds} seed round(s)`;
    element('evaluation-meta').textContent = `Revision ${report.revision} · ${new Date(report.finished).toLocaleString()}`;
    const rows = element('evaluation-rankings'); rows.replaceChildren();
    const row = (list: HTMLElement, values: unknown[]) => {
        const tr = document.createElement('tr'); for (const value of values) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); } list.append(tr);
    };
    for (const r of report.rankings) row(rows, [r.name + (r.games < 20 ? ' *' : ''), r.elo.toFixed(1), r.games, `${r.wins} / ${r.draws} / ${r.losses}`, r.games ? `${(100 * (r.wins + r.draws / 2) / r.games).toFixed(1)}%` : '—', r.moveCount ? r.p95Ms : '—', r.failed]);
    const pairings = new Map<string, { players: string[]; games: number; wins: number[]; draws: number; failed: number }>();
    for (const match of report.matches) {
        const players = [...match.players].sort(); const key = JSON.stringify(players);
        if (!pairings.has(key)) pairings.set(key, { players, games: 0, wins: [0, 0], draws: 0, failed: 0 });
        const pair = pairings.get(key);
        if (match.status !== 'rated') pair.failed++;
        else { pair.games++; if (match.draw) pair.draws++; else pair.wins[players.indexOf(match.winner)]++; }
    }
    const pairs = element('evaluation-pairings'); pairs.replaceChildren();
    for (const pair of pairings.values()) row(pairs, [pair.players.join(' vs '), pair.games, pair.wins[0], pair.draws, pair.wins[1], pair.failed]);
}
function tab(name: 'play' | 'recordings' | 'rankings') {
    element('play-panel').hidden = name !== 'play'; element('recordings-panel').hidden = name !== 'recordings'; element('evaluation-panel').hidden = name !== 'rankings';
    element('game-workspace').hidden = name === 'rankings'; element('rankings-workspace').hidden = name !== 'rankings';
    for (const key of ['play', 'recordings', 'rankings']) button(`${key}-tab`).classList.toggle('active', name === key);
    if (name === 'rankings') { stopPlayback(); handle(refreshRankings); }
}

async function initialize() {
    for (const id of ['width', 'height']) for (let size = 7; size <= 25; size += 2) {
        const option = document.createElement('option'); option.value = String(size); option.textContent = String(size); element<HTMLSelectElement>(id).append(option);
    }
    input('width').value = input('height').value = '11';
    const config = await api<{ snakes: SnakeEndpoint[]; cliAvailable: boolean }>('/api/config'); const stored = saved();
    snakes = Array.isArray(stored?.snakes) && stored.snakes.length && stored.snakes.every(snake => typeof snake.name === 'string' && typeof snake.url === 'string') ? stored.snakes : config.snakes.map((snake, index) => ({ ...snake, selected: config.snakes.some(item => item.name === 'ProjectZ') && config.snakes.some(item => item.name === 'Rando') ? ['ProjectZ', 'Rando'].includes(snake.name) : index < 2 }));
    for (const id of ['width', 'height', 'seed', 'timeout', 'gametype']) { if (stored?.[id]) input(id).value = String(stored[id]); input(id).onchange = persist; }
    renderPlayers();
    element('cli-status').textContent = config.cliAvailable ? 'Rules CLI ready. Matches are saved automatically.' : 'Rules CLI not found. Put battlesnake in this project or set BATTLESNAKE_CLI, then restart the dashboard.';
    button('start-match').disabled = !config.cliAvailable;
    element('match-form').onsubmit = event => {
        event.preventDefault(); persist(); notice(); button('start-match').disabled = true;
        handle(async () => {
            try {
                const options: MatchOptions = { snakes: snakes.filter(snake => snake.selected), width: Number(input('width').value), height: Number(input('height').value), seed: Number(input('seed').value), timeout: Number(input('timeout').value), gametype: input('gametype').value as MatchOptions['gametype'] };
                const state = await api<MatchState>('/api/matches', { method: 'POST', body: JSON.stringify(options) }); await refreshMatches(); await watch(state.id);
            } finally { button('start-match').disabled = false; }
        });
    };
    button('add-snake').onclick = () => {
        const available = config.snakes.find(candidate => !snakes.some(snake => snake.name === candidate.name));
        snakes.push({ ...(available ?? { name: `Snake ${snakes.length + 1}`, url: 'http://localhost:9013' }), selected: true });
        renderPlayers(); persist(); reconnect();
    };
    button('rankings-tab').onclick = () => tab('rankings'); button('refresh-rankings').onclick = () => handle(refreshRankings);
    button('play-tab').onclick = () => tab('play'); button('recordings-tab').onclick = () => { tab('recordings'); handle(refreshRecordings); };
    button('refresh-recordings').onclick = () => handle(refreshRecordings); button('refresh-matches').onclick = () => handle(refreshMatches); input('recording-search').oninput = renderRecordings;
    input('monitor').onchange = reconnect;
    button('stop-match').onclick = () => handle(async () => { const generation = viewGeneration; const state = await api<MatchState>(`/api/matches/${match.id}/stop`, { method: 'POST', body: '{}' }); if (generation === viewGeneration) showMatch(state); });
    input('timeline').oninput = () => { stopPlayback(); frameIndex = Number(input('timeline').value); updatePlayback(); };
    button('previous').onclick = () => { stopPlayback(); frameIndex = Math.max(0, frameIndex - 1); updatePlayback(); };
    button('next').onclick = () => { stopPlayback(); frameIndex = Math.min(replay.frames.length - 1, frameIndex + 1); updatePlayback(); };
    button('playback-toggle').onclick = () => {
        if (playback) { stopPlayback(); return; }
        if (frameIndex === replay.frames.length - 1) frameIndex = 0;
        button('playback-toggle').textContent = 'Pause';
        playback = setInterval(() => { frameIndex++; updatePlayback(); if (frameIndex >= replay.frames.length - 1) stopPlayback(); }, 120);
    };
    input('show-weights').onchange = () => { if (replay) updatePlayback(); else if (match?.frame) renderFrame(match.frame); };
    button('analyze').onclick = () => handle(async () => {
        const id = replay.id; const index = frameIndex; const generation = viewGeneration;
        button('analyze').disabled = true;
        try {
            const grid = await api<Record<string, unknown>[][]>(`/api/recordings/${encodeURIComponent(id)}/analyze`, { method: 'POST', body: JSON.stringify({ frame: index }) });
            if (generation !== viewGeneration || !replay || replay.id !== id) return;
            replay.frames[index].grid = grid; input('show-weights').checked = true; updatePlayback();
        } finally { if (generation === viewGeneration) button('analyze').disabled = false; }
    });
    button('delete-recording').onclick = () => handle(async () => {
        if (!replay || !confirm(`Delete only this recording?\n\n${replay.name}\n\nThis cannot be undone.`)) return;
        await api(`/api/recordings/${encodeURIComponent(replay.id)}`, { method: 'DELETE' }); resetView(); updatePlayback(); element('board').replaceChildren(); element('snake-stats').replaceChildren(); element('move-log').textContent = ''; element('view-title').textContent = 'Recording deleted.'; element('view-subtitle').textContent = 'Choose another recording or start a match.'; await refreshRecordings();
    });
    await Promise.all([refreshRecordings(), refreshMatches()]);
    const id = new URL(location.href).searchParams.get('recording'); if (id) { tab('recordings'); await loadReplay(id); }
}
window.addEventListener('beforeunload', () => { monitor.close(); stream?.close(); stopPlayback(); });
void initialize().catch(error => notice(error.message));
