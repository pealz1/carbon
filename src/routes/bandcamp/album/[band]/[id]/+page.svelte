<script lang="ts">
  import { page } from "$app/state";
  import { parseBandcampUri, releaseUri } from "$lib/bandcamp/uri";
  import BandcampRelease from "$lib/bandcamp/views/BandcampRelease.svelte";
  import Status from "$lib/components/Status.svelte";

  // The address holds Bandcamp's ids only (/bandcamp/album/<band>/a<album> or t<song>); anything else is refused here.
  const release = $derived.by(() => {
    const parsed = parseBandcampUri(`bandcamp:album:${page.params.band}:${page.params.id}`);
    return parsed?.item === "album" ? parsed : null;
  });
</script>

{#if release}
  {#key releaseUri(release.band, release.kind, release.id)}<BandcampRelease band={release.band} kind={release.kind} id={release.id} />{/key}
{:else}
  <Status empty="That isn't a Bandcamp release Carbon knows." />
{/if}
