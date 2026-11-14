<script lang="ts">
  import { page } from "$app/state";
  import Status from "$lib/components/Status.svelte";
  import SoundcloudPlaylist from "$lib/soundcloud/views/SoundcloudPlaylist.svelte";

  const id = $derived(/^\d{1,20}$/.test(page.params.id ?? "") ? page.params.id! : null);
</script>

{#if id}
  {#key id}<SoundcloudPlaylist {id} />{/key}
{:else}
  <Status empty="That isn't a SoundCloud playlist Carbon knows." />
{/if}
