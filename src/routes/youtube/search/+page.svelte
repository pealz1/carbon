<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as api from "$lib/youtube/api";
  import { rememberLikes } from "$lib/youtube/session.svelte";

  // YouTube Music search, kept apart from Spotify's: its own page, with YouTube Music's filters.
  const DEBOUNCE_MS = 320;
  const TOP_SONGS = 5;
  const TABS: { id: api.SearchFilter | "all"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "songs", label: "Songs" },
    { id: "videos", label: "Videos" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
    { id: "playlists", label: "Playlists" },
  ];
  type Tab = (typeof TABS)[number]["id"];

  const initial = page.url.searchParams.get("q") ?? "";
  const initialTab = TABS.find((t) => t.id === page.url.searchParams.get("type"))?.id ?? "all";
  let query = $state(initial);
  let term = $state(initial.trim());
  let tab = $state<Tab>(initialTab);

  // Debounce typing; keep the query and tab in the URL so Back returns to these results.
  $effect(() => {
    const next = query.trim();
    const type = tab;
    const timer = setTimeout(() => {
      term = next;
      const params = new URLSearchParams({ ...(next && { q: next }), ...(type !== "all" && { type }) });
      goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const results = resource(() => {
    const filter = tab === "all" ? undefined : tab;
    return term ? api.search(term, filter) : Promise.resolve(null);
  });
  $effect(() => void (results.data && rememberLikes([...results.data.songs, ...results.data.videos])));

  const r = $derived(results.data);
  const nothing = $derived(r && !r.top && !r.songs.length && !r.videos.length && !r.albums.length && !r.artists.length && !r.playlists.length);
</script>

<div class="field glass">
  <Icon name="search" size={22} />
  <!-- svelte-ignore a11y_autofocus -->
  <input bind:value={query} placeholder="Search YouTube Music" aria-label="Search YouTube Music" autofocus spellcheck="false" />
</div>

<div class="tabs" role="tablist" aria-label="Result type">
  {#each TABS as t (t.id)}
    <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
  {/each}
</div>

{#if !term}
  <Status empty="Search YouTube Music for songs, videos, albums, artists and playlists." />
{:else if results.loading && !r}
  <Status loading />
{:else if results.error}
  <Status error={results.error} onretry={results.reload} />
{:else if r}
  {#if nothing}
    <Status empty={`Nothing on YouTube Music matches “${term}”.`} />
  {:else if tab === "all"}
    {#if r.top || r.songs.length}
      <div class="top">
        {#if r.top}
          <section class="best">
            <h2>Top result</h2>
            <div class="best-card glass"><MediaCard card={r.top} /></div>
          </section>
        {/if}
        {#if r.songs.length}
          <section>
            <h2>Songs</h2>
            <TrackList tracks={r.songs.slice(0, TOP_SONGS)} compact />
          </section>
        {/if}
      </div>
    {/if}
    {#if r.videos.length}
      <section class="list">
        <h2>Videos</h2>
        <TrackList tracks={r.videos.slice(0, TOP_SONGS)} compact />
      </section>
    {/if}
    <Shelf title="Artists" cards={r.artists} />
    <Shelf title="Albums" cards={r.albums} />
    <Shelf title="Playlists" cards={r.playlists} />
  {:else if tab === "songs" || tab === "videos"}
    <TrackList tracks={tab === "songs" ? r.songs : r.videos} showAlbum={tab === "songs"} />
  {:else}
    <Shelf title={TABS.find((t) => t.id === tab)?.label ?? ""} cards={tab === "albums" ? r.albums : tab === "artists" ? r.artists : r.playlists} wrap />
  {/if}
{/if}

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 60px;
    margin: var(--sp-5) 0 var(--sp-4);
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    color: var(--text-muted);
  }

  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-glow);
  }

  input {
    flex: 1;
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-family: var(--font-display);
    font-size: 1.35rem;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
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

  .top {
    display: grid;
    grid-template-columns: minmax(240px, 0.8fr) minmax(0, 2fr);
    gap: var(--sp-5);
    margin-bottom: var(--sp-6);
  }

  .list {
    margin-bottom: var(--sp-6);
  }

  h2 {
    font-size: var(--fs-section);
    margin: 0 var(--sp-2) var(--sp-3);
  }

  .best-card {
    border-radius: var(--r-lg);
    padding: var(--sp-2);
  }
</style>
