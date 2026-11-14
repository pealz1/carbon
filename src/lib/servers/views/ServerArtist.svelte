<script lang="ts">
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";

  // An artist on the listener's own server: their albums, newest first where the server says.
  let { library, kind, id }: { library: ServerLibrary; kind: ServerKind; id: string } = $props();
  const artist = resource(() => library.artist(id));
</script>

{#if artist.loading && !artist.data}
  <Status loading />
{:else if artist.error}
  <Status error={artist.error} onretry={artist.reload} />
{:else if artist.data}
  {@const a = artist.data}
  <DetailHeader title={a.name} image={a.image} playUri={a.uri} round placeholder="artist" chips={[{ label: `Artist on ${SERVER_NAMES[kind]}`, icon: "artist" }]} />
  <Shelf title="Albums" cards={a.albums} wrap />
  {#if !a.albums.length}<Status empty="Your server has no albums by this artist." />{/if}
{/if}
