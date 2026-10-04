<script lang="ts">
    import type { Recording } from '../../../src/shared/dashboard';
    let { recordings, selected, onopen, onrefresh }: { recordings: Recording[]; selected?: string; onopen: (id: string) => void; onrefresh: () => void } = $props();
    let query = $state('');
    const filtered = $derived(recordings.filter(recording => recording.name.toLowerCase().includes(query.toLowerCase())));
</script>
<section class="panel">
    <div class="section-title"><div><p class="eyebrow">REPLAY LIBRARY</p><h2>Saved recordings</h2></div><button class="text" onclick={onrefresh}>Refresh</button></div>
    <label>Search recordings<input type="search" placeholder="Game ID or snake name…" bind:value={query} /></label>
    <p class="hint">{filtered.length} recording{filtered.length === 1 ? '' : 's'} · Local games and Arena snapshots</p>
    <div class="item-list recordings">{#each filtered as recording (recording.id)}<button class="list-item" class:active={recording.id === selected} onclick={() => onopen(recording.id)}><strong>{recording.name}</strong><span>{recording.kind} · {new Date(recording.modified).toLocaleString()}</span></button>{:else}<p class="empty">No recordings found. Completed local matches are saved automatically.</p>{/each}</div>
</section>
