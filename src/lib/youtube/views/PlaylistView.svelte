<script lang="ts">
  import { untrack } from "svelte";
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import { saved } from "$lib/saved.svelte";
  import type { Card, Track } from "$lib/spotify/types";
  import * as api from "$lib/youtube/api";
  import { ytCardMenu } from "$lib/youtube/menus";
  import { tokenPager } from "$lib/youtube/pager";
  import { rememberLikes, youtube } from "$lib/youtube/session.svelte";

  let { id }: { id: string } = $props();

  // One request gives both the header and the first page of songs; later pages follow tokens.
  // svelte-ignore state_referenced_locally
  let load = api.playlist(id);
  const info = resource(() => load);
  const retry = () => {
    load = api.playlist(id);
    info.reload();
  };

  // Re-read the details after edits (renames refresh the library list).
  let seen = false;
  $effect(() => {
    void youtube.playlists;
    if (seen) untrack(retry);
    seen = true;
  });
  const tracks = tokenPager<Track>(
    () => load.then((p) => ({ items: p.tracks, continuation: p.continuation })),
    (token) => api.playlistMore(token).then((p) => ({ items: p.tracks, continuation: p.continuation })),
  );
  // svelte-ignore state_referenced_locally
  const liked = id === api.LIKED_PLAYLIST;

  // Every row of Liked Music is liked; elsewhere, use what each row says.
  $effect(() => (liked ? saved.remember(tracks.items.map((t) => t.uri), true) : rememberLikes(tracks.items)));

  const card = $derived<Card | null>(
    info.data ? { kind: "playlist", id, uri: info.data.uri, title: info.data.name, subtitle: info.data.ownerName, image: info.data.image, playUri: info.data.uri } : null,
  );
  const dropRow = (uri: string) => (tracks.items = tracks.items.filter((t) => t.uri !== uri));
</script>

{#if info.loading && !info.data}
  <Status loading />
{:else if info.error}
  <Status error={info.error} onretry={retry} />
{:else if info.data}
  {@const p = info.data}
  <DetailHeader
    kind="Playlist"
    title={liked ? "Liked Music" : p.name}
    image={p.largeImage}
    playUri={p.uri}
    shuffleCount={p.trackCount ?? undefined}
    menuItems={card ? () => ytCardMenu(card!) : undefined}
  >
    {#snippet meta()}
      {#if p.description}<p class="description">{p.description}</p>{/if}
      {p.ownerName || (liked ? youtube.account?.name : "") || ""}
      {#if p.trackCount !== null}· {p.trackCount.toLocaleString()} songs{/if}
    {/snippet}
    {#if p.owned && !liked && card}
      <button class="edit" onclick={() => (youtube.dialog = { mode: "rename", playlist: card! })}><Icon name="edit" size={16} />Rename</button>
    {/if}
  </DetailHeader>

  <TrackList
    tracks={tracks.items}
    contextUri={p.uri}
    showAlbum
    numbered
    removeFrom={p.owned && !liked ? { id, name: p.name } : undefined}
    onremove={dropRow}
  />
  {#if tracks.done && !tracks.items.length}<Status empty={liked ? "Songs you like on YouTube Music show up here." : "This playlist is empty."} />{/if}
  <LoadMore pager={tracks} />
{/if}

<style>
  .edit {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 46px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    color: var(--text-muted);
    font-weight: 650;
    transition: color var(--dur-fast);
  }

  .edit:hover {
    color: var(--text);
  }

  .description {
    margin: 0 0 var(--sp-2);
    max-width: 60ch;
    color: var(--text-muted);
  }
</style>
