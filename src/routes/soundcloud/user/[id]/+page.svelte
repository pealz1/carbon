<script lang="ts">
  import { page } from "$app/state";
  import Status from "$lib/components/Status.svelte";
  import SoundcloudUser from "$lib/soundcloud/views/SoundcloudUser.svelte";

  const id = $derived(/^\d{1,20}$/.test(page.params.id ?? "") ? page.params.id! : null);
</script>

{#if id}
  {#key id}<SoundcloudUser {id} />{/key}
{:else}
  <Status empty="That isn't someone on SoundCloud Carbon knows." />
{/if}
