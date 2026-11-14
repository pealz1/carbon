<script lang="ts">
  import * as bandcamp from "$lib/bandcamp/api";
  import DetailHeader, { type Chip } from "$lib/components/DetailHeader.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";

  // An artist or label on Bandcamp: everything they have released, newest first.
  let { band }: { band: string } = $props();
  const artist = resource(() => bandcamp.artist(band));

  const chips = $derived.by<Chip[]>(() => {
    const a = artist.data;
    if (!a) return [];
    return [{ label: "On Bandcamp", icon: "artist" }, ...(a.location ? [{ label: a.location }] : []), { label: `${a.releases.length} ${a.releases.length === 1 ? "release" : "releases"}`, icon: "album" }];
  });
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  {@const a = artist.data}
  <DetailHeader title={a.name} image={a.image} {chips} playUri={a.releases.length ? a.uri : undefined} round placeholder="artist" />
  <Shelf title="Releases" cards={a.releases} wrap />
  {#if !a.releases.length}<Status empty="Nothing released on Bandcamp yet." />{/if}
{/if}
