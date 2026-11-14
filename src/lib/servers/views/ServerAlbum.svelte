<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { formatTotal } from "$lib/format";
  import { hasPage } from "$lib/local/tracks";
  import { resource } from "$lib/resource.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";
  import { pageHref } from "$lib/youtube/uri";

  // An album on the listener's own server.
  let { library, kind, id }: { library: ServerLibrary; kind: ServerKind; id: string } = $props();
  const album = resource(() => library.album(id));
  const totalMs = $derived(album.data?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0);

  const chips = $derived.by<Chip[]>(() => {
    const a = album.data;
    if (!a) return [];
    return [
      { label: `Album on ${SERVER_NAMES[kind]}`, icon: "album" },
      ...(a.year ? [{ label: a.year, icon: "calendar" as const }] : []),
      { label: `${a.tracks.length} ${a.tracks.length === 1 ? "song" : "songs"}`, icon: "note" },
      ...(totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });
</script>

{#if album.loading && !album.data}
  <Status loading />
{:else if album.error}
  <Status error={album.error} onretry={album.reload} />
{:else if album.data}
  {@const a = album.data}
  <DetailHeader title={a.name} image={a.image} {chips} playUri={a.uri} shuffleCount={a.tracks.length}>
    {#snippet byline()}
      {#each a.artists as artist, i (artist.uri || i)}
        {#if hasPage(artist)}
          <a class="person" href={pageHref("artist", artist)}><span class="avatar"><Icon name="artist" size={15} /></span>{artist.name}</a>
        {:else}
          <span class="person">{artist.name}</span>
        {/if}
      {/each}
    {/snippet}
  </DetailHeader>
  <TrackList tracks={a.tracks} contextUri={a.uri} numbered showArt={false} />
  {#if !a.tracks.length}<Status empty="Your server didn't list any songs for this album." />{/if}
{/if}
