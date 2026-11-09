<script lang="ts">
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { greeting } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { uniqueBy } from "$lib/spotify/mappers";
  import type { Card } from "$lib/spotify/types";

  const ON_REPEAT_COUNT = 8;
  const recent = resource(() => sp.recentlyPlayed());
  const top = resource(() => sp.topTracks());
  const artists = resource(() => sp.topArtists());

  // Recently played tracks, folded into the albums they came from.
  const jumpBackIn = $derived<Card[]>(
    uniqueBy(
      (recent.data?.tracks ?? []).filter((t) => t.album),
      (t) => t.album!.id,
    ).map((t) => ({
      kind: "album",
      id: t.album!.id,
      uri: t.album!.uri,
      title: t.album!.name,
      subtitle: t.artists.map((a) => a.name).join(", "),
      image: t.album!.image,
      playUri: t.album!.uri,
    })),
  );

  const playlistCards = $derived<Card[]>(
    session.playlists.map((p) => ({
      kind: "playlist",
      id: p.id,
      uri: p.uri,
      title: p.name,
      subtitle: p.ownerName ? `By ${p.ownerName}` : "Playlist",
      image: p.image,
      playUri: p.uri,
    })),
  );

  const firstName = $derived(session.profile?.name.split(" ")[0] ?? "");
</script>

<header class="hero">
  <p class="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
  <h1>{greeting(new Date())}{firstName ? `, ${firstName}` : ""}.</h1>
</header>

{#if recent.loading && !recent.data}
  <Status loading />
{:else if recent.error}
  <Status error={recent.error} onretry={recent.reload} />
{/if}

<Shelf title="Jump back in" cards={jumpBackIn} />

{#if top.data?.length}
  <section class="repeat">
    <h2>On repeat</h2>
    <div class="columns">
      <TrackList tracks={top.data.slice(0, ON_REPEAT_COUNT)} compact />
    </div>
  </section>
{/if}

<Shelf title="Artists in your orbit" cards={artists.data ?? []} />
<Shelf title="Your playlists" cards={playlistCards} />

<style>
  .hero {
    padding: var(--sp-6) var(--sp-2) var(--sp-5);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 750;
    line-height: 1;
    max-width: 16ch;
  }

  .eyebrow {
    margin: 0 0 var(--sp-3);
  }

  .repeat {
    margin-bottom: var(--sp-6);
  }

  .repeat h2 {
    font-size: var(--fs-section);
    margin: 0 var(--sp-2) var(--sp-3);
  }

  .columns :global(ol) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sp-4);
  }
</style>
