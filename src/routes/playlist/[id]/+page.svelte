<script lang="ts">
  import { page } from "$app/state";
  import { tools } from "$lib/playlist-tools/tools.svelte";
  import PlaylistView from "$lib/views/PlaylistView.svelte";
</script>

<!-- Sorting or removing duplicates rewrites the playlist; the page reads it again. -->
{#key `${page.params.id}:${tools.version}`}
  <PlaylistView id={page.params.id!} />
{/key}
