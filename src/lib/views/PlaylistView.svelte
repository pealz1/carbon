<script lang="ts">
  import { untrack } from "svelte";
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { formatTotal } from "$lib/format";
  import { playlistMenu } from "$lib/menus";
  import { Pager } from "$lib/pager.svelte";
  import { resource } from "$lib/resource.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import type { Track } from "$lib/spotify/types";

  let { id }: { id: string } = $props();

  const info = resource(() => sp.playlist(id));
  const tracks = new Pager<Track>((offset) => sp.playlistTracks(id, offset));
  // Spotify only gives development-mode apps the track list of playlists you own.
  const owned = $derived(!!info.data && info.data.ownerId === session.profile?.id);
  const totalMs = $derived(tracks.items.reduce((sum, t) => sum + t.durationMs, 0));

  // Re-read details after edits elsewhere (the sidebar list refreshes after every playlist change).
  let seen = false;
  $effect(() => {
    void session.playlists;
    if (seen) untrack(() => info.reload());
    seen = true;
  });

  const chips = $derived.by<Chip[]>(() => {
    const p = info.data;
    if (!p) return [];
    return [
      { label: p.collaborative ? "Collaborative" : "Playlist", icon: "note" },
      ...(p.trackCount !== null ? [{ label: `${p.trackCount} ${p.trackCount === 1 ? "song" : "songs"}`, icon: "listAdd" as const }] : []),
      ...(owned && tracks.done && totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });

  const edit = () => info.data && (dialogs.playlist = { mode: "edit", playlist: info.data, largeImage: info.data.largeImage });
  const dropRow = (uri: string) => (tracks.items = tracks.items.filter((t) => t.uri !== uri));
</script>

{#if info.loading && !info.data}
  <Status loading />
{:else if info.error}
  <Status error={info.error} onretry={info.reload} />
{:else if info.data}
  {@const p = info.data}
  <DetailHeader
    title={p.name}
    image={p.largeImage}
    {chips}
    description={p.description}
    playUri={p.uri}
    shuffleCount={p.trackCount ?? undefined}
    menuItems={() => playlistMenu(p, p.largeImage)}
  >
    {#snippet byline()}
      <span class="person"><span class="avatar"><Icon name="artist" size={15} /></span>{p.ownerName}</span>
    {/snippet}
    {#if owned}
      <button class="edit" onclick={edit} aria-label="Edit details" title="Edit details"><Icon name="edit" size={18} /></button>
    {/if}
  </DetailHeader>

  {#if owned}
    <TrackList tracks={tracks.items} contextUri={p.uri} showAlbum numbered removeFrom={p} onremove={dropRow} />
    {#if tracks.done && !tracks.items.length}<Status empty="This playlist is empty. Add songs from any menu with “Add to playlist”." />{/if}
    <LoadMore pager={tracks} />
  {:else}
    <p class="notice plate">Spotify only shares track lists with apps like Carbon for playlists you own. Press Play and it'll still play in Carbon.</p>
  {/if}
{/if}

<style>
  .edit {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px rgb(255 255 255 / 0.08);
    color: var(--text);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .edit:hover {
    background: rgb(255 255 255 / 0.15);
  }

  .notice {
    max-width: 62ch;
    margin: 0;
    padding: var(--sp-4) var(--sp-5);
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
