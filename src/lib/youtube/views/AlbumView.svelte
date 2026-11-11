<script lang="ts">
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { formatTotal } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import * as api from "$lib/youtube/api";
  import { ytCardMenu } from "$lib/youtube/menus";
  import { rememberLikes } from "$lib/youtube/session.svelte";
  import { pageHref } from "$lib/youtube/uri";

  let { id }: { id: string } = $props();
  const album = resource(() => api.album(id));
  const totalMs = $derived(album.data?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0);
  $effect(() => void (album.data && rememberLikes(album.data.tracks)));

  const chips = $derived.by<Chip[]>(() => {
    const a = album.data;
    if (!a) return [];
    return [
      { label: a.type || "Album", icon: "album" },
      ...(a.year ? [{ label: a.year, icon: "calendar" as const }] : []),
      { label: `${a.tracks.length} ${a.tracks.length === 1 ? "song" : "songs"}`, icon: "note" },
      ...(totalMs ? [{ label: formatTotal(totalMs), icon: "clock" as const }] : []),
    ];
  });
</script>

{#if album.loading && !album.data}
  <Status loading />
{:else if album.error}
  <Status error={album.error} onretry={album.reload} />
{:else if album.data}
  {@const a = album.data}
  <DetailHeader
    title={a.name}
    image={a.largeImage}
    {chips}
    description={a.description || null}
    playUri={a.uri}
    shuffleCount={a.tracks.length}
    menuItems={() => ytCardMenu({ kind: "album", id: a.id, uri: a.uri, title: a.name, subtitle: "", image: a.image, playUri: a.uri })}
  >
    {#snippet byline()}
      {#each a.artists as artist, i (artist.uri)}
        <a class="person" href={pageHref("artist", artist)}>
          {#if i === 0 && a.artistImage}
            <img class="avatar" src={a.artistImage} alt="" width="28" height="28" />
          {:else}
            <span class="avatar"><Icon name="artist" size={15} /></span>
          {/if}
          {artist.name}
        </a>
      {/each}
    {/snippet}
  </DetailHeader>
  <TrackList tracks={a.tracks} contextUri={a.uri} numbered showArt={false} />
  {#if !a.tracks.length}<Status empty="YouTube Music didn't list any songs for this album." />{/if}
{/if}
