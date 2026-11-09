<script lang="ts">
  import { untrack } from "svelte";
  import DetailHeader from "$lib/components/DetailHeader.svelte";
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
    kind="Playlist"
    title={p.name}
    image={p.largeImage}
    playUri={p.uri}
    shuffleCount={p.trackCount ?? undefined}
    menuItems={() => playlistMenu(p, p.largeImage)}
  >
    {#snippet meta()}
      {#if info.data?.description}<p class="description">{info.data.description}</p>{/if}
      {info.data?.ownerName}
      {#if info.data?.trackCount !== null}· {info.data?.trackCount} songs{/if}
      {#if owned && tracks.done && totalMs}· {formatTotal(totalMs)}{/if}
    {/snippet}
    {#if owned}
      <button class="edit" onclick={edit}><Icon name="edit" size={16} />Edit</button>
    {/if}
  </DetailHeader>

  {#if owned}
    <TrackList tracks={tracks.items} contextUri={p.uri} showAlbum numbered removeFrom={p} onremove={dropRow} />
    {#if tracks.done && !tracks.items.length}<Status empty="This playlist is empty." />{/if}
    <LoadMore pager={tracks} />
  {:else}
    <p class="notice glass">
      Spotify only shares track lists with apps like Carbon for playlists you own. Press Play and it'll still play in Carbon.
    </p>
  {/if}
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

  .notice {
    max-width: 62ch;
    margin: 0 var(--sp-2);
    padding: var(--sp-4) var(--sp-5);
    border-radius: var(--r-md);
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
