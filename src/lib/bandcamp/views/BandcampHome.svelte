<script lang="ts">
  import { page } from "$app/state";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import * as bandcamp from "$lib/bandcamp/api";
  import { resource } from "$lib/resource.svelte";
  import SearchBox from "$lib/soundcloud/shared/SearchBox.svelte";

  // Bandcamp's front page in Carbon is its search: artists, labels, albums and songs.
  let term = $state((page.url.searchParams.get("q") ?? "").trim());
  const found = resource(() => (term ? bandcamp.search(term) : Promise.resolve(null)));
</script>

<header class="page-head"><h1>Bandcamp</h1></header>
<SearchBox bind:term placeholder="Search artists, albums and songs" label="Search Bandcamp" />

{#if !term}
  <Status empty="Search Bandcamp to listen to what artists stream there." />
{:else if found.loading && !found.data}
  <Status loading />
{:else if found.error}
  <Status error={found.error} onretry={found.reload} />
{:else if found.data}
  {@const r = found.data}
  <Shelf title="Albums" cards={r.albums} feature />
  <Shelf title="Artists and labels" cards={r.artists} />
  {#if r.tracks.length}
    <section>
      <h2>Songs</h2>
      <TrackList tracks={r.tracks} showAlbum />
    </section>
  {/if}
  {#if !r.tracks.length && !r.albums.length && !r.artists.length}
    <Status empty={`Nothing on Bandcamp matches “${term}”.`} />
  {/if}
{/if}

<style>
  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }
</style>
