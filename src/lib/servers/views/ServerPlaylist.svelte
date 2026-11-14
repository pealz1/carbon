<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { formatTotal } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";

  // A playlist kept on the listener's own server.
  let { library, kind, id }: { library: ServerLibrary; kind: ServerKind; id: string } = $props();
  const playlist = resource(() => library.playlist(id));
  const totalMs = $derived(playlist.data?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0);

  const chips = $derived.by<Chip[]>(() => {
    const p = playlist.data;
    if (!p) return [];
    return [
      { label: `Playlist on ${SERVER_NAMES[kind]}`, icon: "library" },
      { label: `${p.tracks.length} ${p.tracks.length === 1 ? "song" : "songs"}`, icon: "note" },
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
  <DetailHeader title={p.name} image={p.image} {chips} playUri={p.uri} shuffleCount={p.tracks.length} />
  <TrackList tracks={p.tracks} contextUri={p.uri} showAlbum />
  {#if !p.tracks.length}<Status empty="This playlist is empty." />{/if}
{/if}
