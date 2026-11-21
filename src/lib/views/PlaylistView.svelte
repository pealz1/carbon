<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { formatTotal } from "$lib/format";
  import { pastedSpotifyItems } from "$lib/links";
  import { playlistMenu } from "$lib/menus";
  import { Pager } from "$lib/pager.svelte";
  import { resource } from "$lib/resource.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";

  let { id }: { id: string } = $props();

  const info = resource(async () => {
    const playlistId = id;
    const listed = session.playlists.find((p) => p.id === playlistId);
    const { playlist, first } = await sp.playlistPage(playlistId, listed);
    playlist.tracksReadable = first !== null;
    if (listed) listed.tracksReadable = playlist.tracksReadable;
    const tracks = first && new Pager((offset) => sp.playlistTracks(playlistId, offset), first);
    return { playlist, tracks, listed: !!listed };
  });
  const p = $derived(info.data?.playlist);
  const tracks = $derived(info.data?.tracks);
  const owned = $derived(!!p?.ownerId && p.ownerId === session.profile?.id);
  const canEditTracks = $derived(owned || (info.data?.listed && p?.collaborative));
  const totalMs = $derived(tracks?.items.reduce((sum, t) => sum + t.durationMs, 0));

  const chips = $derived.by<Chip[]>(() => {
    if (!p) return [];
    const count = tracks?.total ?? p.trackCount;
    return [
      { label: p.collaborative ? "Collaborative" : "Playlist", icon: "note" },
      ...(count !== null ? [{ label: `${count} ${count === 1 ? "item" : "items"}`, icon: "listAdd" as const }] : []),
      ...(tracks?.done && totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });

  const edit = () => p && (dialogs.playlist = { mode: "edit", playlist: p, largeImage: p.largeImage });
  const dropRow = (uri: string) => { if (tracks) tracks.items = tracks.items.filter((t) => t.uri !== uri); };
  let pasted = $state("");
  let pasteError = $state("");
  function reviewCopy() {
    try {
      const addUris = pastedSpotifyItems(pasted);
      pasteError = "";
      dialogs.playlist = { mode: "create", name: p?.name, addUris };
    } catch (e) {
      pasteError = e instanceof Error ? e.message : "Couldn't read those links.";
    }
  }
</script>

{#if info.loading && !info.data}
  <Status loading />
{:else if info.error}
  <Status error={info.error} onretry={info.reload} />
{:else if p}
  <DetailHeader
    title={p.name}
    image={p.largeImage}
    playlistCover={{ id: p.id, public: p.public }}
    {chips}
    description={p.description}
    playUri={p.uri}
    shuffleCount={tracks?.total ?? p.trackCount ?? undefined}
    menuItems={() => playlistMenu(p!, p!.largeImage)}
  >
    {#snippet byline()}
      {#if p?.ownerName}<span class="person"><span class="avatar"><Icon name="artist" size={15} /></span>{p.ownerName}</span>{/if}
      <a class="link" href={sp.playlistUrl(id)} onclick={(e) => { e.preventDefault(); void openUrl(sp.playlistUrl(id)); }}>Open in Spotify</a>
    {/snippet}
    {#if owned}
      <button class="edit" onclick={edit} aria-label="Edit details" title="Edit details"><Icon name="edit" size={18} /></button>
    {/if}
  </DetailHeader>

  {#if tracks}
    <TrackList tracks={tracks.items} contextUri={p.uri} showAlbum showArt numbered tools="Playlist order" removeFrom={canEditTracks ? p : undefined} onremove={dropRow} />
    {#if tracks.done && !tracks.items.length}<Status empty={tracks.total === 0 ? "This playlist is empty." : "No playable songs in this playlist."} />{/if}
    <LoadMore pager={tracks} />
  {:else if p.public !== false}
    <iframe title={`${p.name} on Spotify`} src={`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`} height="352"
      loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"></iframe>
  {:else}
    <p class="notice">Open this private playlist in Spotify, or ask its owner to invite you as a collaborator.</p>
  {/if}
  {#if !tracks}
    <details class="copy plate">
      <summary>Make an editable copy</summary>
      <label for="playlist-links">In Spotify, select the songs you want and copy them. Paste their links here in playlist order.</label>
      <textarea class="input" id="playlist-links" rows="4" bind:value={pasted}></textarea>
      {#if pasteError}<p role="alert">{pasteError}</p>{/if}
      <button class="pill" onclick={reviewCopy} disabled={!pasted.trim()}>Review new playlist</button>
    </details>
  {/if}
{/if}

<style>
  iframe { width: 100%; border: 0; border-radius: var(--r-art); }
  .copy { margin-top: var(--sp-3); padding: var(--sp-4); }
  .copy summary { cursor: pointer; }
  .copy label, .copy textarea { display: block; margin: var(--sp-3) 0; }
  .copy textarea { width: 100%; }
  .edit {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(var(--tint) / 0.08);
    box-shadow: var(--rim);
    color: var(--text);
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-med) var(--ease-spring),
      transform var(--dur-med) var(--ease-spring);
  }

  .edit:hover {
    background: rgb(var(--tint) / 0.15);
    box-shadow: var(--rim-hover);
    translate: 0 -1px;
  }

  .notice {
    max-width: 62ch;
    margin: 0;
    padding: var(--sp-4) var(--sp-5);
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
