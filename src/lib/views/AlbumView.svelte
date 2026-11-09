<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { formatTotal } from "$lib/format";
  import { albumMenu } from "$lib/menus";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";

  let { id }: { id: string } = $props();
  const album = resource(() => sp.album(id));
  const totalMs = $derived(album.data?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0);
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
    menuItems={() => albumMenu({ kind: "album", id: a.id, uri: a.uri, title: a.name, subtitle: "", image: a.image, playUri: a.uri }, a.tracks)}
  >
    {#snippet meta()}
      {#each album.data?.artists ?? [] as artist, i (artist.uri)}
        {#if i > 0}{", "}{/if}<a class="artist" href="/artist/{artist.id}">{artist.name}</a>
      {/each}
      · {album.data?.year} · {album.data?.tracks.length} songs · {formatTotal(totalMs)}
    {/snippet}
  </DetailHeader>
  <TrackList tracks={album.data.tracks} contextUri={album.data.uri} numbered showArt={false} />
{/if}

<style>
  .artist {
    color: var(--text);
    font-weight: 650;
  }
</style>
