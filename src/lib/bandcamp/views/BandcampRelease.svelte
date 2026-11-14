<script lang="ts">
  import * as bandcamp from "$lib/bandcamp/api";
  import { bandcampHref, type ReleaseKind } from "$lib/bandcamp/uri";
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { formatTotal } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import { playableOf } from "$lib/soundcloud/shared/listed";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";

  // A Bandcamp album, or a song released on its own.
  let { band, kind, id }: { band: string; kind: ReleaseKind; id: string } = $props();
  const release = resource(() => bandcamp.release(band, kind, id));
  const playable = $derived(playableOf(release.data?.tracks ?? []));

  const chips = $derived.by<Chip[]>(() => {
    const r = release.data;
    if (!r) return [];
    const totalMs = r.tracks.reduce((sum, l) => sum + l.track.durationMs, 0);
    return [
      { label: `${r.single ? "Song" : "Album"} on Bandcamp`, icon: r.single ? "note" : "album" },
      ...(r.year ? [{ label: r.year, icon: "calendar" as const }] : []),
      ...(r.single ? [] : [{ label: `${r.tracks.length} ${r.tracks.length === 1 ? "song" : "songs"}`, icon: "note" as const }]),
      ...(totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });
</script>

{#if release.loading && !release.data}
  <Status loading />
{:else if release.error}
  <Status error={release.error} onretry={release.reload} />
{:else if release.data}
  {@const r = release.data}
  {@const artist = bandcampHref(r.artist.uri)}
  <DetailHeader title={r.name} image={r.image} {chips} playUri={playable.length ? r.uri : undefined} shuffleCount={playable.length}>
    {#snippet byline()}
      {#if artist}
        <a class="person" href={artist}><span class="avatar"><Icon name="artist" size={15} /></span>{r.artist.name}</a>
      {:else}
        <span class="person">{r.artist.name}</span>
      {/if}
    {/snippet}
  </DetailHeader>
  <SongList listed={r.tracks} service="Bandcamp" contextUri={r.uri} numbered={!r.single} showArt={false} />
  {#if !r.tracks.length}<Status empty="Bandcamp didn't list any songs for this release." />{/if}
{/if}
