<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { toolItems } from "$lib/playlist-tools/tools.svelte";
  import { saved } from "$lib/saved.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import type { Track } from "$lib/spotify/types";

  const liked = new Pager<Track>((offset) => sp.likedTracks(offset));
  // Playing the collection context keeps next/previous inside Liked Songs.
  const contextUri = $derived(session.profile ? `spotify:user:${session.profile.id}:collection` : undefined);
  // Every row here is liked; no need to ask Spotify.
  $effect(() => saved.remember(liked.items.map((t) => t.uri), true));
</script>

<DetailHeader
  title="Liked Songs"
  image={null}
  placeholder="heart"
  playUri={contextUri}
  shuffleCount={liked.total ?? undefined}
  menuItems={() => toolItems({ kind: "liked", name: "Liked Songs" })}
  chips={[{ label: "Collection", icon: "heart" }, ...(liked.total !== null ? [{ label: `${liked.total.toLocaleString()} songs`, icon: "note" as const }] : [])]}
>
  {#snippet byline()}
    {#if session.profile}
      <span class="person">
        {#if session.profile.image}
          <img class="avatar" src={session.profile.image} alt="" width="28" height="28" />
        {:else}
          <span class="avatar">{session.profile.name.slice(0, 1).toUpperCase()}</span>
        {/if}
        {session.profile.name}
      </span>
    {/if}
  {/snippet}
</DetailHeader>

<TrackList tracks={liked.items} {contextUri} showAlbum numbered />
{#if liked.done && !liked.items.length}
  <Status empty="Songs you like will show up here." />
{/if}
<LoadMore pager={liked} />
