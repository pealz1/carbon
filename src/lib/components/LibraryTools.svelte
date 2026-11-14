<script lang="ts">
  import CombineDialog from "$lib/playlist-tools/CombineDialog.svelte";
  import ImportDialog from "$lib/playlist-tools/ImportDialog.svelte";
  import ToolsDialog from "$lib/playlist-tools/ToolsDialog.svelte";
  import { tools } from "$lib/playlist-tools/tools.svelte";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import { smart } from "$lib/smart/store.svelte";

  // The library tools' app-wide pieces: their dialogs, opened from menus anywhere, and the daily
  // smart-playlist refresh. Spotify counts as ready once the profile (and with it the playlist
  // list) has loaded, so a refresh never mistakes a list still loading for a deleted playlist.
  $effect(() => void smart.startup(services.active.spotify && !!session.profile));
</script>

{#if tools.dialog?.kind === "tools"}
  {#key tools.dialog}<ToolsDialog source={tools.dialog.source} tab={tools.dialog.tab} />{/key}
{:else if tools.dialog?.kind === "import"}
  <ImportDialog />
{:else if tools.dialog?.kind === "combine"}
  <CombineDialog first={tools.dialog.first} />
{/if}
