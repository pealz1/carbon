<script lang="ts">
  import { page } from "$app/state";
  import ArtistView from "$lib/views/ArtistView.svelte";
</script>

{#key page.params.id}
  <ArtistView id={page.params.id!} />
{/key}
