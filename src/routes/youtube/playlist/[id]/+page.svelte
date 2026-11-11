<script lang="ts">
  import { page } from "$app/state";
  import PlaylistView from "$lib/youtube/views/PlaylistView.svelte";
</script>

{#key page.params.id}
  <PlaylistView id={page.params.id!} />
{/key}
