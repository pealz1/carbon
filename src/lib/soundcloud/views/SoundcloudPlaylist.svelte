<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeError } from "$lib/errors";
  import { formatTotal } from "$lib/format";
  import { t } from "$lib/i18n/locale.svelte";
  import { openPlayer } from "$lib/providers/catalog";
  import { resource } from "$lib/resource.svelte";
  import * as soundcloud from "$lib/soundcloud/api";
  import { playableOf } from "$lib/soundcloud/shared/listed";
  import SearchBox from "$lib/soundcloud/shared/SearchBox.svelte";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";
  import { soundcloudHref } from "$lib/soundcloud/uri";
  import type { Track } from "$lib/spotify/types";
  import { toasts } from "$lib/toast.svelte";

  // A SoundCloud playlist or album (an album is a playlist there).
  let { id }: { id: string } = $props();
  const playlist = resource(() => soundcloud.playlist(id));
  const account = resource(() => soundcloud.account().catch(() => null));
  const playable = $derived(playableOf(playlist.data?.tracks ?? []));
  const canEdit = $derived(!!account.data?.id && account.data.id === playlist.data?.owner.id && !playlist.data?.album);
  const currentTrackIds = $derived(new Set(playlist.data?.tracks.map(({ track }) => track.id)));
  let editing = $state(false);
  let changeError = $state<string | null>(null);
  let busy = $state(false);
  let title = $state("");
  let term = $state("");
  const matches = resource(() => editing && term ? soundcloud.findTracks(term) : Promise.resolve([]));

  function edit() {
    title = playlist.data?.name ?? "";
    term = "";
    changeError = null;
    editing = !editing;
  }

  async function change(request: soundcloud.PlaylistChange) {
    if (busy) return;
    busy = true;
    changeError = null;
    try {
      await soundcloud.changePlaylist(request);
      playlist.reload();
    } catch (error) {
      changeError = describeError(error);
    } finally {
      busy = false;
    }
  }

  function rename(event: SubmitEvent) {
    event.preventDefault();
    if (title.trim() && title.trim() !== playlist.data?.name) void change({ kind: "rename", id, title });
  }

  async function openInSoundcloud(address: string) {
    try {
      await openPlayer("soundcloud", address);
    } catch (error) {
      toasts.error(describeError(error));
    }
  }

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
      {#if p.permalink}
        <button class="pill" onclick={() => openInSoundcloud(p.permalink!)}>Open in SoundCloud</button>
      {/if}
    {/snippet}
  </DetailHeader>
  {#if canEdit}
    <button class="pill edit" onclick={edit} aria-expanded={editing}>{editing ? "Done" : "Edit playlist"}</button>
    {#if editing}
      <form class="rename" onsubmit={rename}>
        <input class="input" aria-label="Playlist name" bind:value={title} maxlength="200" />
        <button class="pill" type="submit" disabled={busy || playlist.loading || !title.trim() || title.trim() === p.name}>Save</button>
      </form>
      {#if changeError}<Status error={changeError} />{/if}
      <SearchBox bind:term placeholder="Find songs" label="Search SoundCloud" persist={false} />
      {#if term}
        {#if matches.loading}
          <Status loading />
        {:else if matches.error}
          <Status error={matches.error} onretry={matches.reload} />
        {:else if matches.data?.length}
          <SongList listed={matches.data} service="SoundCloud" rowAction={addTrack} />
        {:else}
          <Status empty={`Nothing on SoundCloud matches “${term}”.`} />
        {/if}
      {/if}
    {/if}
  {/if}
  <SongList listed={p.tracks} service="SoundCloud" contextUri={p.uri} numbered={p.album} rowAction={canEdit && editing ? removeTrack : undefined} />
  {#if !p.tracks.length}
    <Status empty="SoundCloud didn't list any songs here." />
  {:else if p.total > p.tracks.length}
    <p class="note">Showing {p.tracks.length} of {p.total} songs.</p>
  {/if}
{/if}

{#snippet addTrack(track: Track)}
  {@const added = currentTrackIds.has(track.id)}
  <button
    class="pill action"
    disabled={busy || playlist.loading || added}
    aria-label={`${t(added ? "Added" : "Add to playlist")} · ${track.name}`}
    title={added ? "Added" : "Add to playlist"}
    onclick={(event) => { event.stopPropagation(); void change({ kind: "add", id, track: track.id }); }}
  ><Icon name={added ? "check" : "plus"} size={16} /></button>
{/snippet}

{#snippet removeTrack(track: Track)}
  <button
    class="pill action"
    disabled={busy || playlist.loading}
    aria-label={`${t("Remove from playlist")} · ${track.name}`}
    title="Remove from playlist"
    onclick={(event) => { event.stopPropagation(); void change({ kind: "remove", id, track: track.id }); }}
  ><Icon name="close" size={16} /></button>
{/snippet}

<style>
  .edit { margin-bottom: var(--sp-3); }
  .rename { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
  .action { width: 30px; height: 30px; display: grid; place-items: center; padding: 0; }
  .note {
    margin: var(--sp-3) 0 var(--sp-6);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }
</style>
