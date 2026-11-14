<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
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
  // The discography can be narrowed to one kind of release; the choice lives in the address so Back keeps it.
  const KINDS: { id: string; label: string; groups?: sp.AlbumGroup[] }[] = [
    { id: "", label: "All" },
    { id: "album", label: "Albums", groups: ["album"] },
    { id: "single", label: "Singles and EPs", groups: ["single"] },
    { id: "compilation", label: "Compilations", groups: ["compilation"] },
    { id: "appears_on", label: "Appears on", groups: ["appears_on"] },
  ];
  const kind = $derived(KINDS.find((k) => k.id === page.url.searchParams.get("show")) ?? KINDS[0]);
  const everything = new Pager<Card>((offset) => sp.artistAlbums(id, offset));
  const albums = $derived(kind.groups ? new Pager<Card>((offset) => sp.artistAlbums(id, offset, kind.groups)) : everything);
  const discography = $derived(uniqueBy(albums.items, (c) => c.title.toLowerCase()));
  // The latest release is the artist's own, whatever the list below is narrowed to.
  $effect(() => {
    // Once: a failed first page is retried from the list below, not in a loop here.
    untrack(() => void (!everything.items.length && !everything.done && !everything.error && everything.more()));
  });
  // Spotify groups albums before singles, so the newest is picked by year (album cards lead with it).
  const yearOf = (card: Card) => Number(card.subtitle.slice(0, 4)) || 0;
  const latest = $derived(everything.items.reduce<Card | null>((best, card) => (!best || yearOf(card) > yearOf(best) ? card : best), null));
  const showKind = (id: string) => goto(id ? `?show=${id}` : "?", { replaceState: true, noScroll: true, keepFocus: true });
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

<div class="segmented kinds" role="radiogroup" aria-label="Kind of release">
  {#each KINDS as k (k.id)}
    <button role="radio" aria-checked={kind === k} class:active={kind === k} onclick={() => showKind(k.id)}>{k.label}</button>
  {/each}
</div>
<Shelf title={kind.groups ? kind.label : "Discography"} cards={discography} wrap />
{#if albums.done && !discography.length && !albums.error}
  <Status empty={kind.groups ? `Nothing under ${kind.label.toLowerCase()} for this artist.` : "No releases found for this artist."} />
{/if}
{#key albums}<LoadMore pager={albums} />{/key}

<style>
  .kinds {
    margin-bottom: var(--sp-4);
  }

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
