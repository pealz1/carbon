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
  import { shuffledFrom } from "$lib/local/queue";
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

  const shuffle = () => void player.playQueue(shuffledFrom(playable, Math.floor(Math.random() * playable.length)));

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
  <DetailHeader
    title={playlist.name}
    image={playable.find((t) => t.album?.image)?.album?.image ?? null}
    placeholder="listAdd"
    onplay={playable.length ? () => play(null) : undefined}
    onshuffle={playable.length ? shuffle : undefined}
    chips={[
      { label: "Carbon playlist", icon: "listAdd" },
      { label: `${playable.length} ${playable.length === 1 ? "song" : "songs"}`, icon: "note" },
      { label: formatTotal(totalMs), icon: "clock" },
      { label: "On this PC", icon: "folder" },
    ]}
  >
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
      <button class="pill circle" onclick={() => (confirmDelete = true)} aria-label="Delete playlist" title="Delete playlist"><Icon name="trash" size={18} /></button>
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
  .pill {
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px rgb(255 255 255 / 0.08);
    color: var(--text);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .pill:hover {
    background: rgb(255 255 255 / 0.15);
  }

  .pill.circle {
    width: 44px;
    padding: 0;
  }

  .pill.danger {
    background: var(--danger);
    color: var(--ink);
  }

  .rename {
    display: flex;
    gap: var(--sp-2);
  }

  .rename input {
    height: 44px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    border: 0;
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    background: rgb(0 0 0 / 0.3);
    color: var(--text);
    font: inherit;
    user-select: text;
  }

  .rename input:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
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
    grid-template-columns: 40px 40px minmax(0, 1fr) auto 48px auto;
    align-items: center;
    gap: var(--sp-3);
    height: 54px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    transition: background var(--dur-fast);
  }

  li:nth-child(odd) {
    background: var(--row-stripe);
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
    color: var(--text-faint);
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
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .blank {
    background: var(--graphite-800);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
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

  .duration {
    color: var(--text-faint);
    text-align: right;
  }

  .badge {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .badge.local {
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent-glow);
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
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .tools button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-active);
  }

  .tools button:disabled {
    opacity: 0.3;
  }
</style>
