<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { artistMenu } from "$lib/menus";
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
  // Spotify groups albums before singles, so the newest is picked by year (album cards lead with it).
  const yearOf = (card: Card) => Number(card.subtitle.slice(0, 4)) || 0;
  const latest = $derived(discography.reduce<Card | null>((best, card) => (!best || yearOf(card) > yearOf(best) ? card : best), null));
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  {@const a = artist.data}
  <DetailHeader
    title={a.name}
    image={a.largeImage}
    playUri={a.uri}
    round
    placeholder="artist"
    chips={[{ label: "Artist", icon: "artist" }]}
    menuItems={() => artistMenu({ kind: "artist", id: a.id, uri: a.uri, title: a.name, subtitle: "Artist", image: a.image, playUri: a.uri })}
  />
{/if}

{#if artist.data}
  <section class="overview" class:solo={!latest}>
    {#if latest}
      <div class="latest">
        <h2>Latest release</h2>
        <MediaCard card={latest} feature />
      </div>
    {/if}
    <div class="popular">
      <h2>Popular</h2>
      {#if songs.data?.length}
        <TrackList tracks={songs.data} numbered />
      {:else}
        <Status loading={songs.loading} error={songs.error} empty="No songs found for this artist." onretry={songs.reload} />
      {/if}
    </div>
  </section>
{/if}

<Shelf title="Discography" cards={discography} wrap />
<LoadMore pager={albums} />

<style>
  .overview {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
    gap: var(--sp-5);
    margin-bottom: var(--sp-6);
  }

  .overview.solo {
    grid-template-columns: minmax(0, 1fr);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .popular {
    min-width: 0;
    margin-right: calc(var(--sp-2) * -1);
  }

  @container stage (max-width: 900px) {
    .overview {
      grid-template-columns: minmax(0, 1fr);
    }

    .latest {
      max-width: 300px;
    }
  }
</style>
