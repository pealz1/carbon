<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { trackCard } from "$lib/spotify/mappers";

  const DEBOUNCE_MS = 320;
  const TOP_SONGS = 5;

  const initial = page.url.searchParams.get("q") ?? "";
  let query = $state(initial);
  let term = $state(initial.trim());

  // Debounce typing, and keep the query in the URL so Back returns to these results.
  $effect(() => {
    const next = query.trim();
    const timer = setTimeout(() => {
      term = next;
      goto(next ? `?q=${encodeURIComponent(next)}` : "?", { replaceState: true, keepFocus: true, noScroll: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const results = resource(() => (term ? sp.search(term) : Promise.resolve(null)));
  const topResult = $derived(results.data?.artists[0] ?? (results.data?.tracks[0] ? trackCard(results.data.tracks[0]) : null));
</script>

<div class="field glass">
  <Icon name="search" size={22} />
  <!-- svelte-ignore a11y_autofocus -->
  <input bind:value={query} placeholder="What do you want to hear?" aria-label="Search Spotify" autofocus spellcheck="false" />
</div>

{#if !term}
  <Status empty="Search for songs, artists, albums and playlists." />
{:else if results.loading && !results.data}
  <Status loading />
{:else if results.error}
  <Status error={results.error} onretry={results.reload} />
{:else if results.data}
  {#if topResult || results.data.tracks.length}
    <div class="top">
      {#if topResult}
        <section class="best">
          <h2>Top result</h2>
          <div class="best-card glass"><MediaCard card={topResult} /></div>
        </section>
      {/if}
      {#if results.data.tracks.length}
        <section class="songs">
          <h2>Songs</h2>
          <TrackList tracks={results.data.tracks.slice(0, TOP_SONGS)} compact />
        </section>
      {/if}
    </div>
  {:else}
    <Status empty={`Nothing on Spotify matches “${term}”.`} />
  {/if}
  <Shelf title="Artists" cards={results.data.artists} />
  <Shelf title="Albums" cards={results.data.albums} />
  <Shelf title="Playlists" cards={results.data.playlists} />
{/if}

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 60px;
    margin: var(--sp-5) 0 var(--sp-6);
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

  .top {
    display: grid;
    grid-template-columns: minmax(240px, 0.8fr) minmax(0, 2fr);
    gap: var(--sp-5);
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
