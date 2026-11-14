<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { formatTotal } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import * as soundcloud from "$lib/soundcloud/api";
  import { playableOf } from "$lib/soundcloud/shared/listed";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";
  import { soundcloudHref } from "$lib/soundcloud/uri";

  // A SoundCloud playlist or album (an album is a playlist there).
  let { id }: { id: string } = $props();
  const playlist = resource(() => soundcloud.playlist(id));
  const playable = $derived(playableOf(playlist.data?.tracks ?? []));

  const chips = $derived.by<Chip[]>(() => {
    const p = playlist.data;
    if (!p) return [];
    const totalMs = p.tracks.reduce((sum, l) => sum + l.track.durationMs, 0);
    return [
      { label: `${p.album ? "Album" : "Playlist"} on SoundCloud`, icon: p.album ? "album" : "cloud" },
      ...(p.album && p.year ? [{ label: p.year, icon: "calendar" as const }] : []),
      { label: `${p.total} ${p.total === 1 ? "song" : "songs"}`, icon: "note" },
      ...(totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });
</script>

{#if playlist.loading && !playlist.data}
  <Status loading />
{:else if playlist.error}
  <Status error={playlist.error} onretry={playlist.reload} />
{:else if playlist.data}
  {@const p = playlist.data}
  {@const owner = soundcloudHref(p.owner.uri)}
  <DetailHeader title={p.name} image={p.image} {chips} playUri={playable.length ? p.uri : undefined} shuffleCount={playable.length}>
    {#snippet byline()}
      {#if owner}
        <a class="person" href={owner}><span class="avatar"><Icon name="artist" size={15} /></span>{p.owner.name}</a>
      {:else}
        <span class="person">{p.owner.name}</span>
      {/if}
    {/snippet}
  </DetailHeader>
  <SongList listed={p.tracks} service="SoundCloud" contextUri={p.uri} numbered={p.album} />
  {#if !p.tracks.length}
    <Status empty="SoundCloud didn't list any songs here." />
  {:else if p.total > p.tracks.length}
    <p class="note">Showing {p.tracks.length} of {p.total} songs.</p>
  {/if}
{/if}

<style>
  .note {
    margin: var(--sp-3) 0 var(--sp-6);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }
</style>
