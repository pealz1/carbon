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

  // The all-results page lists songs without length or album, so its songs come from the songs tab.
  async function allResults(query: string) {
    const [all, songs] = await Promise.all([api.search(query), api.search(query, "songs")]);
    return { ...all, songs: songs.songs.length ? songs.songs : all.songs };
  }

  const results = resource(() => {
    if (!term) return Promise.resolve(null);
    return tab === "all" ? allResults(term) : api.search(term, tab);
  });
  $effect(() => void (results.data && rememberLikes([...results.data.songs, ...results.data.videos])));

  const r = $derived(results.data);
  const nothing = $derived(r && !r.top && !r.songs.length && !r.videos.length && !r.albums.length && !r.artists.length && !r.playlists.length);
</script>

<div class="field">
  <Icon name="search" size={22} />
  <!-- svelte-ignore a11y_autofocus -->
  <input bind:value={query} type="search" placeholder="Search YouTube Music" aria-label="Search YouTube Music" autofocus spellcheck="false" />
</div>

<div class="segmented filters" role="tablist" aria-label="Result type">
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
            <div class="best-card"><MediaCard card={r.top} feature /></div>
          </section>
        {/if}
        {#if r.songs.length}
          <section class="songs">
            <h2>Songs</h2>
            <TrackList tracks={r.songs.slice(0, TOP_SONGS)} compact />
          </section>
        {/if}
      </div>
    {/if}
    {#if r.videos.length}
      <section class="songs videos">
        <h2>Videos</h2>
        <TrackList tracks={r.videos.slice(0, TOP_SONGS)} compact />
      </section>
    {/if}
    <Shelf title="Artists" cards={r.artists} />
    <Shelf title="Albums" cards={r.albums} />
    <Shelf title="Playlists" cards={r.playlists} />
  {:else if tab === "songs" || tab === "videos"}
    <div class="songs"><TrackList tracks={tab === "songs" ? r.songs : r.videos} showAlbum={tab === "songs"} /></div>
  {:else}
    <Shelf title={TABS.find((t) => t.id === tab)?.label ?? ""} cards={tab === "albums" ? r.albums : tab === "artists" ? r.artists : r.playlists} wrap />
  {/if}
{/if}

<style>
  /* The Spotify search page's field. */
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 56px;
    margin: var(--sp-5) 0 var(--sp-4);
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .field:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
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
    font-size: 1.25rem;
    font-weight: 600;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  .filters {
    margin-bottom: var(--sp-6);
  }

  .top {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
    gap: var(--sp-5);
    margin-bottom: var(--sp-6);
  }

  @container stage (max-width: 820px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }

    .best-card {
      max-width: 300px;
    }
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .songs {
    min-width: 0;
    margin-right: calc(var(--sp-2) * -1);
  }

  .videos {
    margin-bottom: var(--sp-6);
  }
</style>
