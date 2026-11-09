<script lang="ts">
  import { page } from "$app/state";
  import AlbumView from "$lib/views/AlbumView.svelte";
</script>

{#key page.params.id}
  <AlbumView id={page.params.id!} />
{/key}
