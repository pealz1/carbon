<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { uniqueBy } from "$lib/spotify/mappers";
  import type { Card } from "$lib/spotify/types";

  let { id }: { id: string } = $props();

  // Each section loads on its own so one failing call never blanks the page.
  const artist = resource(() => sp.artist(id));
  const songs = resource(() => (artist.data ? sp.artistSongs(id, artist.data.name) : Promise.resolve(null)));
  const albums = new Pager<Card>((offset) => sp.artistAlbums(id, offset));
  const discography = $derived(uniqueBy(albums.items, (c) => c.title.toLowerCase()));
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  <DetailHeader kind="Artist" title={artist.data.name} image={artist.data.largeImage} playUri={artist.data.uri} round />
{/if}

{#if artist.data}
  <section class="popular">
    <h2>Popular</h2>
    {#if songs.data?.length}
      <TrackList tracks={songs.data} numbered />
    {:else}
      <Status loading={songs.loading} error={songs.error} empty="No songs found for this artist." onretry={songs.reload} />
    {/if}
  </section>
{/if}

<Shelf title="Discography" cards={discography} wrap />
<LoadMore pager={albums} />

<style>
  .popular {
    margin-bottom: var(--sp-6);
  }

  h2 {
    font-size: var(--fs-section);
    margin: 0 var(--sp-2) var(--sp-3);
  }
</style>
