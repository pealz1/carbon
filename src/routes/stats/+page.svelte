<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { RANGES, rangeOf, topAlbums } from "$lib/stats";

  // The listener's most played artists, songs and albums over Spotify's three windows. The range
  // lives in the address, so Back returns to the same one.
  const TOP_COUNT = 50;
  const range = $derived(rangeOf(page.url.searchParams.get("range")));
  const artists = resource(() => sp.topArtists(range, TOP_COUNT));
  const tracks = resource(() => sp.topTracks(range, TOP_COUNT));
  const albums = $derived(topAlbums(tracks.data ?? []));
  const loading = $derived((artists.loading && !artists.data) || (tracks.loading && !tracks.data));
  const error = $derived(artists.error ?? tracks.error);
  const empty = $derived(!loading && !error && !artists.data?.length && !tracks.data?.length);

  const reload = () => (artists.reload(), tracks.reload());
</script>

<header class="page-head">
  <div class="title">
    <h1>Your top music</h1>
    <p class="status">What you've played most on Spotify, as Spotify counts it.</p>
  </div>
  <div class="segmented" role="radiogroup" aria-label="Time range">
    {#each RANGES as r (r.id)}
      <button role="radio" aria-checked={range === r.id} class:active={range === r.id} onclick={() => goto(`?range=${r.id}`, { replaceState: true, noScroll: true, keepFocus: true })}>
        {r.label}
      </button>
    {/each}
  </div>
</header>

{#if loading}
  <Status loading />
{:else if error}
  <Status {error} onretry={reload} />
{:else if empty}
  <Status empty="Nothing here yet. Spotify fills this in after you've listened for a while." />
{:else}
  {#if artists.data?.length}<Shelf title="Top artists" cards={artists.data} />{/if}
  {#if albums.length}<Shelf title="Albums you keep coming back to" cards={albums} />{/if}
  {#if tracks.data?.length}
    <section class="songs">
      <h2>Top songs</h2>
      <TrackList tracks={tracks.data} numbered showAlbum />
    </section>
  {/if}
{/if}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .status {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .segmented {
    margin-left: auto;
  }

  .songs {
    margin-top: var(--sp-6);
  }

  .songs h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }
</style>
