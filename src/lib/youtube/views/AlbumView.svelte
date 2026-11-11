<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
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
</script>

{#if album.loading && !album.data}
  <Status loading />
{:else if album.error}
  <Status error={album.error} onretry={album.reload} />
{:else if album.data}
  {@const a = album.data}
  <DetailHeader
    kind={a.type}
    title={a.name}
    image={a.largeImage}
    playUri={a.uri}
    shuffleCount={a.tracks.length}
    menuItems={() => ytCardMenu({ kind: "album", id: a.id, uri: a.uri, title: a.name, subtitle: "", image: a.image, playUri: a.uri })}
  >
    {#snippet meta()}
      {#each a.artists as artist, i (artist.uri)}
        {#if i > 0}{", "}{/if}<a class="artist" href={pageHref("artist", artist)}>{artist.name}</a>
      {/each}
      {#if a.year}· {a.year}{/if} · {a.tracks.length} songs{#if totalMs} · {formatTotal(totalMs)}{/if}
    {/snippet}
  </DetailHeader>
  <TrackList tracks={a.tracks} contextUri={a.uri} numbered showArt={false} />
  {#if !a.tracks.length}<Status empty="YouTube Music didn't list any songs for this album." />{/if}
{/if}

<style>
  .artist {
    color: var(--text);
    font-weight: 650;
  }
</style>
