<script lang="ts">
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import type { Card } from "$lib/spotify/types";
  import * as api from "$lib/youtube/api";
  import { youtube } from "$lib/youtube/session.svelte";

  // Your YouTube Music library: playlists, albums and artists (signed in only).
  const TABS = [
    { id: "playlists", label: "Playlists", load: api.libraryPlaylists },
    { id: "albums", label: "Albums", load: api.libraryAlbums },
    { id: "artists", label: "Artists", load: api.libraryArtists },
  ] as const;
  let tab = $state<(typeof TABS)[number]["id"]>("playlists");

  const items = resource<Card[]>(() => {
    const current = TABS.find((t) => t.id === tab)!;
    return youtube.signedIn ? current.load() : Promise.resolve([]);
  });
  const likedCard: Card = {
    kind: "playlist",
    id: api.LIKED_PLAYLIST,
    uri: `ytm:playlist:${api.LIKED_PLAYLIST}`,
    title: "Liked Music",
    subtitle: "Songs you like",
    image: null,
    playUri: `ytm:playlist:${api.LIKED_PLAYLIST}`,
  };
  // Liked Music leads the playlists, whether or not YouTube listed it.
  const cards = $derived(tab === "playlists" ? [likedCard, ...(items.data ?? []).filter((c) => c.id !== api.LIKED_PLAYLIST)] : (items.data ?? []));
</script>

<header class="head">
  <p class="eyebrow">YouTube Music</p>
  <h1>Library</h1>
</header>

{#if !youtube.signedIn}
  <div class="signin glass">
    <p>Sign in to YouTube Music to see your playlists, albums and artists here.</p>
    <a class="pill" href="/settings">Open Settings</a>
  </div>
{:else}
  <div class="tabs" role="tablist" aria-label="Library">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
    {#if tab === "playlists"}
      <button class="new" onclick={() => (youtube.dialog = { mode: "create", videoIds: [] })}>New playlist</button>
    {/if}
  </div>
  {#if items.loading && !items.data}
    <Status loading />
  {:else if items.error}
    <Status error={items.error} onretry={items.reload} />
  {:else if !cards.length}
    <Status empty="Nothing here yet." />
  {:else}
    <Shelf title={TABS.find((t) => t.id === tab)?.label ?? ""} {cards} wrap />
  {/if}
{/if}

<style>
  .head {
    padding: var(--sp-6) var(--sp-2) var(--sp-4);
  }

  .eyebrow {
    margin: 0 0 var(--sp-2);
    color: var(--accent);
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 750;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0 var(--sp-1) var(--sp-5);
  }

  .tabs button {
    height: 32px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    color: var(--text-muted);
    font-weight: 600;
    font-size: var(--fs-small);
    transition:
      background var(--dur-fast),
      color var(--dur-fast);
  }

  .tabs button:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .tabs button.active {
    background: var(--text);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .tabs .new {
    margin-left: auto;
    border-style: dashed;
  }

  .signin {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    max-width: 62ch;
    margin: 0 var(--sp-2);
    padding: var(--sp-4) var(--sp-5);
    border-radius: var(--r-md);
    color: var(--text-muted);
  }

  .signin p {
    margin: 0;
    line-height: 1.5;
  }

  .pill {
    flex: none;
    display: grid;
    place-items: center;
    height: 36px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
    text-decoration: none;
  }
</style>
