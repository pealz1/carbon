<script lang="ts">
  import { untrack } from "svelte";
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
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
  const tracks = tokenPager<Track>(
    () => load.then((p) => ({ items: p.tracks, continuation: p.continuation })),
    (token) => api.playlistMore(token).then((p) => ({ items: p.tracks, continuation: p.continuation })),
  );
  // svelte-ignore state_referenced_locally
  const liked = id === api.LIKED_PLAYLIST;

  // Re-read the details after edits (renames refresh the library list).
  let seen = false;
  $effect(() => {
    void youtube.playlists;
    if (seen) untrack(retry);
    seen = true;
  });

  // Every row of Liked Music is liked; elsewhere, use what each row says.
  $effect(() => (liked ? saved.remember(tracks.items.map((t) => t.uri), true) : rememberLikes(tracks.items)));

  const card = $derived<Card | null>(
    info.data ? { kind: "playlist", id, uri: info.data.uri, title: info.data.name, subtitle: info.data.ownerName, image: info.data.image, playUri: info.data.uri } : null,
  );
  const chips = $derived.by<Chip[]>(() => {
    const p = info.data;
    if (!p) return [];
    return [{ label: "Playlist", icon: "note" }, ...(p.trackCount !== null ? [{ label: `${p.trackCount.toLocaleString()} ${p.trackCount === 1 ? "song" : "songs"}`, icon: "listAdd" as const }] : [])];
  });
  const owner = $derived(info.data?.ownerName || (liked ? youtube.account?.name : "") || "");
  const dropRow = (uri: string) => (tracks.items = tracks.items.filter((t) => t.uri !== uri));
</script>

{#if info.loading && !info.data}
  <Status loading />
{:else if info.error}
  <Status error={info.error} onretry={retry} />
{:else if info.data}
  {@const p = info.data}
  <DetailHeader
    title={liked ? "Liked Music" : p.name}
    image={liked ? null : p.largeImage}
    placeholder={liked ? "heart" : "note"}
    {chips}
    description={p.description || null}
    playUri={p.uri}
    shuffleCount={p.trackCount ?? undefined}
    menuItems={card ? () => ytCardMenu(card!) : undefined}
  >
    {#snippet byline()}
      {#if owner}<span class="person"><span class="avatar"><Icon name="artist" size={15} /></span>{owner}</span>{/if}
    {/snippet}
    {#if p.owned && !liked && card}
      <button class="edit" onclick={() => (youtube.dialog = { mode: "rename", playlist: card! })} aria-label="Rename" title="Rename"><Icon name="edit" size={18} /></button>
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
  /* Same as the Spotify playlist page's edit button: a 44 px circle in the header. */
  .edit {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.08);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.1),
      inset 0 0 0 1px rgb(255 255 255 / 0.08);
    color: var(--text);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .edit:hover {
    background: rgb(255 255 255 / 0.15);
  }
</style>
