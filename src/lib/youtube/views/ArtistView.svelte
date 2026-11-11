<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as api from "$lib/youtube/api";
  import { ytCardMenu } from "$lib/youtube/menus";
  import { rememberLikes } from "$lib/youtube/session.svelte";

  let { id }: { id: string } = $props();
  const artist = resource(() => api.artist(id));
  $effect(() => void (artist.data && rememberLikes(artist.data.songs)));
  // YouTube Music lists releases newest first: the first album or single leads, like Spotify's page.
  const latest = $derived(artist.data?.shelves.find((s) => s.cards[0]?.kind === "album")?.cards[0] ?? null);
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
    menuItems={() => ytCardMenu({ kind: "artist", id: a.id, uri: a.uri, title: a.name, subtitle: "Artist", image: a.image, playUri: a.uri })}
  />
  {#if a.songs.length || latest}
    <section class="overview" class:solo={!latest}>
      {#if latest}
        <div class="latest">
          <h2>Latest release</h2>
          <MediaCard card={latest} feature />
        </div>
      {/if}
      {#if a.songs.length}
        <div class="popular">
          <h2>Top songs</h2>
          <TrackList tracks={a.songs} contextUri={a.uri} numbered />
        </div>
      {/if}
    </section>
  {/if}
  {#each a.shelves as shelf, i (shelf.title + i)}
    <Shelf title={shelf.title} cards={shelf.cards} />
  {/each}
  {#if !a.songs.length && !a.shelves.length}<Status empty="YouTube Music has nothing listed for this artist." />{/if}
{/if}

<style>
  /* The Spotify artist page's layout: latest release beside the top songs. */
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
