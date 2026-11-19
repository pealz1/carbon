<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import TrackTools from "$lib/components/TrackTools.svelte";
  import { arrange, type TrackSort } from "$lib/track-tools";
  import { formatTotal } from "$lib/format";
  import { albumMenu } from "$lib/menus";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";

  let { id }: { id: string } = $props();
  const album = resource(() => sp.album(id));
  // The lead artist's photo for the byline; the page works without it.
  const lead = resource(() => {
    const first = album.data?.artists[0];
    return first?.id ? sp.artist(first.id) : Promise.resolve(null);
  });
  const totalMs = $derived(album.data?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0);
  const KINDS: Record<string, string> = { album: "Album", single: "Single", compilation: "Compilation" };
  let query = $state("");
  let sort = $state<TrackSort>("default");
  let descending = $state(false);
  const shown = $derived(arrange(album.data?.tracks ?? [], query, sort, descending));
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
    playUri={a.uri}
    shuffleCount={a.tracks.length}
    chips={[
      { label: KINDS[a.type] ?? "Album", icon: "album" },
      ...(a.year ? [{ label: a.year, icon: "calendar" as const }] : []),
      { label: `${a.tracks.length} ${a.tracks.length === 1 ? "song" : "songs"}`, icon: "note" },
      { label: formatTotal(totalMs), icon: "clock" },
    ]}
    share={{ uri: a.uri, name: a.artists.length ? `${a.name} – ${a.artists.map((x) => x.name).join(", ")}` : a.name }}
    facts={[
      ...(a.released ? [{ label: "Released", value: a.released }] : []),
      ...(a.artists.length ? [{ label: a.artists.length === 1 ? "Artist" : "Artists", value: a.artists.map((x) => x.name).join(", ") }] : []),
      ...(a.genres.length ? [{ label: "Genres", value: a.genres.join(", ") }] : []),
      ...(a.label ? [{ label: "Record label", value: a.label }] : []),
      ...(a.copyright ? [{ label: "Copyright", value: a.copyright }] : []),
    ]}
    menuItems={() => albumMenu({ kind: "album", id: a.id, uri: a.uri, title: a.name, subtitle: "", image: a.image, playUri: a.uri }, a.tracks)}
  >
    {#snippet byline()}
      {#each a.artists as artist, i (artist.uri)}
        <a class="person" href="/artist/{artist.id}">
          {#if i === 0 && lead.data?.image}
            <img class="avatar" src={lead.data.image} alt="" width="28" height="28" />
          {:else}
            <span class="avatar"><Icon name="artist" size={15} /></span>
          {/if}
          {artist.name}
        </a>
      {/each}
    {/snippet}
  </DetailHeader>
  {#if a.tracks.length > 1}<TrackTools bind:query bind:sort bind:descending count={shown.tracks.length} />{/if}
  <TrackList tracks={shown.tracks} numbers={shown.numbers} contextUri={a.uri} numbered showArt={false} />
  {#if query && !shown.tracks.length}<Status empty="No songs match “{query}”." />{/if}
{/if}
