<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeRules, type SmartPlaylist } from "$lib/smart/rules";
  import SmartEditor from "$lib/smart/SmartEditor.svelte";
  import { smart } from "$lib/smart/store.svelte";

  // Smart playlists: rules over your own library, kept as a Carbon or Spotify playlist.
  let editing = $state<SmartPlaylist | null | undefined>(undefined);
  let confirming = $state<string | null>(null);

  onMount(() => void smart.load());

  const SOURCE_LABELS = { liked: "Liked Songs", playlists: "Your playlists", albums: "Saved albums", local: "Local files" } as const;
  const sourcesOf = (p: SmartPlaylist) =>
    (Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[]).filter((k) => p.sources[k]).map((k) => SOURCE_LABELS[k]).join(", ");
  const hrefOf = (p: SmartPlaylist) => (p.targetId ? (p.output === "spotify" ? `/playlist/${p.targetId}` : `/carbon/${p.targetId}`) : null);

  function when(ms: number): string {
    if (!ms) return "Not refreshed yet";
    const minutes = Math.round((Date.now() - ms) / 60_000);
    if (minutes < 1) return "Refreshed just now";
    if (minutes < 60) return `Refreshed ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `Refreshed ${hours} h ago` : `Refreshed ${new Date(ms).toLocaleDateString()}`;
  }
</script>

<header class="page-head">
  <h1>Smart playlists</h1>
  <button class="pill accent new" onclick={() => (editing = null)}><Icon name="plus" size={16} />New smart playlist</button>
</header>

{#if smart.error}<p class="warn" role="alert">{smart.error}</p>{/if}

{#if !smart.loaded}
  <Status loading />
{:else if !smart.list.length}
  <section class="empty plate">
    <Icon name="spark" size={36} />
    <h2>Playlists that keep themselves up to date</h2>
    <p>Pick songs from your Liked Songs, your own playlists, saved albums and local files by artist, date added, length, explicitness or release year. Carbon keeps the result as a playlist and refreshes it every day you open Carbon.</p>
    <button class="pill accent" onclick={() => (editing = null)}><Icon name="plus" size={16} />New smart playlist</button>
  </section>
{:else}
  <ul class="list">
    {#each smart.list as p (p.id)}
      {@const busy = smart.busy[p.id]}
      {@const href = hrefOf(p)}
      <li class="plate">
        <span class="mark"><Icon name="spark" size={22} /></span>
        <div class="text">
          <h2>{#if href}<a {href}>{p.name}</a>{:else}{p.name}{/if}</h2>
          <p class="rules">{describeRules(p)}</p>
          <p class="meta">
            {sourcesOf(p)} · {p.output === "spotify" ? "Spotify playlist" : "Carbon playlist"} · up to {p.limit.toLocaleString()} ·
            <span aria-live="polite">{busy ?? when(p.refreshedMs)}</span>
          </p>
        </div>
        <div class="actions">
          {#if confirming === p.id}
            <span class="confirm">Stop updating it? The playlist stays.</span>
            <button class="pill danger solid" onclick={() => smart.remove(p.id).then(() => (confirming = null))}>Stop</button>
            <button class="pill" onclick={() => (confirming = null)}>Keep</button>
          {:else}
            <button class="pill" onclick={() => smart.refresh(p.id)} disabled={!!busy}><Icon name="refresh" size={15} />{busy ? "Refreshing…" : "Refresh"}</button>
            <button class="pill ghost" onclick={() => (editing = p)} disabled={!!busy}><Icon name="edit" size={15} />Edit</button>
            <button class="pill ghost" onclick={() => (confirming = p.id)} aria-label="Delete {p.name}" title="Delete"><Icon name="trash" size={15} /></button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

{#if editing !== undefined}
  <SmartEditor playlist={editing} onclose={() => (editing = undefined)} />
{/if}

<style>
  .new {
    margin-left: auto;
    align-self: flex-end;
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    max-width: 640px;
    padding: var(--sp-5);
    color: var(--accent);
  }

  .empty h2 {
    color: var(--text);
    font-size: var(--fs-section);
  }

  .empty p {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-3);
  }

  .mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: radial-gradient(90% 120% at 20% 0%, var(--graphite-700), var(--graphite-900));
    color: var(--accent);
  }

  .text {
    min-width: 0;
  }

  h2 {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .rules,
  .meta {
    margin: 2px 0 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .rules {
    color: var(--text-muted);
  }

  .meta {
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .confirm {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  @container stage (max-width: 820px) {
    .list li {
      grid-template-columns: 44px minmax(0, 1fr);
    }

    .actions {
      grid-column: 2;
    }
  }
</style>
