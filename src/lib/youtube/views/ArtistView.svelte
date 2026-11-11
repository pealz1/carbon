<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
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
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  {@const a = artist.data}
  <DetailHeader
    kind="Artist"
    title={a.name}
    image={a.largeImage}
    playUri={a.uri}
    round
    menuItems={() => ytCardMenu({ kind: "artist", id: a.id, uri: a.uri, title: a.name, subtitle: "Artist", image: a.image, playUri: a.uri })}
  />
  {#if a.songs.length}
    <section class="popular">
      <h2>Top songs</h2>
      <TrackList tracks={a.songs} contextUri={a.uri} numbered />
    </section>
  {/if}
  {#each a.shelves as shelf, i (shelf.title + i)}
    <Shelf title={shelf.title} cards={shelf.cards} />
  {/each}
  {#if !a.songs.length && !a.shelves.length}<Status empty="YouTube Music has nothing listed for this artist." />{/if}
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
