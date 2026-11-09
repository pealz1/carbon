<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { formatDuration, formatTotal } from "$lib/format";
  import { localLibrary } from "$lib/local/library.svelte";
  import { carbonPlaylists as store } from "$lib/local/playlists.svelte";
  import { isLocalUri, LOCAL_PREFIX } from "$lib/local/tracks";
  import { player } from "$lib/player.svelte";
  import type { Track } from "$lib/spotify/types";

  const playlist = $derived(store.find(page.params.id ?? ""));
  /** Every stored item, with its track when it can still be played. */
  const rows = $derived(
    (playlist?.items ?? []).map((item) => ({
      track: item.kind === "spotify" ? item.track : (localLibrary.byUri.get(LOCAL_PREFIX + item.id) ?? null),
      kind: item.kind,
    })),
  );
  const playable = $derived(rows.flatMap((r) => (r.track ? [r.track] : [])));
  const totalMs = $derived(playable.reduce((sum, t) => sum + t.durationMs, 0));
  let renaming = $state(false);
  let name = $state("");
  let confirmDelete = $state(false);

  onMount(() => void Promise.all([store.load(), localLibrary.load()]));

  function play(track: Track | null) {
    const index = track ? playable.indexOf(track) : 0;
    if (playable.length) void player.playQueue(playable, Math.max(0, index));
  }

  async function saveName() {
    if (playlist && (await store.rename(playlist.id, name))) renaming = false;
  }

  async function remove() {
    if (playlist && (await store.remove(playlist.id))) void goto("/local");
  }
</script>

{#if !playlist}
  <Status loading={!store.list.length && !store.error} error={store.error} empty="This playlist doesn't exist anymore." />
{:else}
  <DetailHeader kind="Carbon playlist" title={playlist.name} image={playable.find((t) => t.album?.image)?.album?.image ?? null}>
    {#snippet meta()}
      {playable.length} songs · {formatTotal(totalMs)} · Stored on this PC
    {/snippet}
    <button class="play" onclick={() => play(null)} disabled={!playable.length}><Icon name="play" size={20} /> Play</button>
    {#if renaming}
      <form class="rename" onsubmit={(e) => (e.preventDefault(), saveName())}>
        <label class="sr-only" for="playlist-name">Playlist name</label>
        <input id="playlist-name" bind:value={name} maxlength="100" />
        <button class="pill" type="submit">Save</button>
        <button class="pill" type="button" onclick={() => (renaming = false)}>Cancel</button>
      </form>
    {:else}
      <button class="pill" onclick={() => ((name = playlist?.name ?? ""), (renaming = true))}>Rename</button>
    {/if}
    {#if confirmDelete}
      <button class="pill danger" onclick={remove}>Delete for good</button>
      <button class="pill" onclick={() => (confirmDelete = false)}>Keep it</button>
    {:else}
      <button class="pill" onclick={() => (confirmDelete = true)} aria-label="Delete playlist"><Icon name="trash" size={16} /></button>
    {/if}
  </DetailHeader>

  {#if store.error}<p class="warn" role="alert">{store.error}</p>{/if}

  {#if rows.length}
    <ol class="items">
      {#each rows as row, i (i)}
        {@const current = row.track && player.isCurrent(row.track.uri)}
        <li class:current class:missing={!row.track}>
          <button class="lead" onclick={() => play(row.track)} disabled={!row.track} aria-label={row.track ? `Play ${row.track.name}` : "Missing file"}>
            <span class="index tabular">{i + 1}</span>
            <span class="go"><Icon name="play" size={14} /></span>
          </button>
          {#if row.track?.album?.image}
            <img src={row.track.album.image} alt="" width="40" height="40" loading="lazy" decoding="async" />
          {:else}
            <span class="blank"></span>
          {/if}
          <div class="text">
            <span class="name">{row.track?.name ?? "File not found"}</span>
            <span class="sub">{row.track ? row.track.artists.map((a) => a.name).join(", ") : "Rescan or remove it"}</span>
          </div>
          <span class="badge" class:local={row.kind === "local"}>{row.kind === "local" ? "Local" : "Spotify"}</span>
          <span class="duration tabular">{row.track ? formatDuration(row.track.durationMs) : ""}</span>
          <span class="tools">
            <button onclick={() => store.move(playlist.id, i, i - 1)} disabled={i === 0} aria-label="Move up"><Icon name="up" size={15} /></button>
            <button onclick={() => store.move(playlist.id, i, i + 1)} disabled={i === rows.length - 1} aria-label="Move down"><Icon name="down" size={15} /></button>
            <button onclick={() => store.removeItem(playlist.id, i)} aria-label="Remove from playlist"><Icon name="close" size={14} /></button>
          </span>
        </li>
      {/each}
    </ol>
  {:else}
    <Status empty="Empty for now. Use the add-to-playlist button on any song, Spotify or local." />
  {/if}
  {#if playable.some((t) => !isLocalUri(t.uri)) && playable.some((t) => isLocalUri(t.uri))}
    <p class="fine">Spotify songs and local files take turns: one stops before the other starts, and crossfade only blends local files.</p>
  {/if}
{/if}

<style>
  .play {
    height: 44px;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    box-shadow: 0 12px 28px -10px var(--accent-glow);
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .play:hover:not(:disabled) {
    transform: scale(1.04);
  }

  .play:disabled {
    opacity: 0.5;
  }

  .pill {
    height: 38px;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition: background var(--dur-fast);
  }

  .pill:hover {
    background: var(--glass-edge-top);
  }

  .pill.danger {
    background: var(--danger);
    color: var(--accent-ink);
  }

  .rename {
    display: flex;
    gap: var(--sp-2);
  }

  .rename input {
    height: 38px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    color: var(--text);
    font: inherit;
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .fine {
    margin-top: var(--sp-4);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .items {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: 36px 40px minmax(0, 1fr) auto 52px auto;
    align-items: center;
    gap: var(--sp-3);
    height: 56px;
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border-radius: var(--r-md);
    transition: background var(--dur-fast);
  }

  li:hover,
  li:focus-within {
    background: var(--glass-hover);
  }

  li.current .name {
    color: var(--accent);
  }

  li.missing {
    opacity: 0.55;
  }

  .lead {
    position: relative;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .go {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text);
    opacity: 0;
  }

  li:hover .lead:not(:disabled) .go,
  .lead:focus-visible .go {
    opacity: 1;
  }

  li:hover .lead:not(:disabled) .index,
  .lead:focus-visible .index {
    opacity: 0;
  }

  img,
  .blank {
    width: 40px;
    height: 40px;
    border-radius: var(--r-sm);
    object-fit: cover;
  }

  .blank {
    background: var(--glass-hover);
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .sub,
  .duration {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .badge {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    border: 1px solid var(--glass-edge);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .badge.local {
    color: var(--accent);
    border-color: var(--accent-glow);
  }

  .tools {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  li:hover .tools,
  .tools:focus-within {
    opacity: 1;
  }

  .tools button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
  }

  .tools button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-active);
  }

  .tools button:disabled {
    opacity: 0.3;
  }
</style>
