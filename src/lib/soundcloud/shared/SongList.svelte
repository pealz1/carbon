<script lang="ts">
  import type { Snippet } from "svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import type { Track } from "$lib/spotify/types";
  import DimmedTracks from "./DimmedTracks.svelte";
  import { dimmedOf, playableOf, type Listed } from "./listed";

  // A service's songs: the ones Carbon can play as an ordinary track list, the rest folded beneath it.
  let {
    listed,
    service,
    contextUri,
    numbered = false,
    showArt = true,
    showAlbum = false,
    rowAction,
  }: { listed: Listed[]; service: string; contextUri?: string; numbered?: boolean; showArt?: boolean; showAlbum?: boolean; rowAction?: Snippet<[Track]> } = $props();
  const tracks = $derived(playableOf(listed));
</script>

{#if tracks.length}<TrackList {tracks} {contextUri} {numbered} {showArt} {showAlbum} {rowAction} />{/if}
<DimmedTracks songs={dimmedOf(listed)} {service} {rowAction} />
