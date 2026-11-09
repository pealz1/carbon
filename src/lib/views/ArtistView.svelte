<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";

  let { id }: { id: string } = $props();
  const artist = resource(() => sp.artist(id));
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  <DetailHeader kind="Artist" title={artist.data.name} image={artist.data.largeImage} playUri={artist.data.uri} round />
  {#if artist.data.topTracks.length}
    <section class="popular">
      <h2>Popular</h2>
      <TrackList tracks={artist.data.topTracks} numbered />
    </section>
  {/if}
  <Shelf title="Discography" cards={artist.data.albums} wrap />
{/if}

<style>
  .popular {
    margin-bottom: var(--sp-6);
  }

  h2 {
    font-size: var(--fs-section);
    margin: 0 var(--sp-2) var(--sp-3);
  }
</style>
