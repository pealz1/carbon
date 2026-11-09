<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import type { Track } from "$lib/spotify/types";

  const liked = new Pager<Track>((offset) => sp.likedTracks(offset));
  // Playing the collection context keeps next/previous inside Liked Songs.
  const contextUri = $derived(session.profile ? `spotify:user:${session.profile.id}:collection` : undefined);
</script>

<DetailHeader kind="Playlist" title="Liked Songs" image={null} playUri={contextUri}>
  {#snippet meta()}
    {session.profile?.name}{liked.total !== null ? ` · ${liked.total.toLocaleString()} songs` : ""}
  {/snippet}
</DetailHeader>

<TrackList tracks={liked.items} {contextUri} showAlbum numbered />
{#if liked.done && !liked.items.length}
  <Status empty="Songs you like will show up here." />
{/if}
<LoadMore pager={liked} />
