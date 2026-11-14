<script lang="ts">
  import { page } from "$app/state";
  import BandcampArtist from "$lib/bandcamp/views/BandcampArtist.svelte";
  import Status from "$lib/components/Status.svelte";

  const band = $derived(/^\d{1,20}$/.test(page.params.id ?? "") ? page.params.id! : null);
</script>

{#if band}
  {#key band}<BandcampArtist {band} />{/key}
{:else}
  <Status empty="That isn't a Bandcamp artist Carbon knows." />
{/if}
