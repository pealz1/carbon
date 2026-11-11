<script lang="ts">
  import ImportDialog from "$lib/playlist-tools/ImportDialog.svelte";
  import ToolsDialog from "$lib/playlist-tools/ToolsDialog.svelte";
  import { tools } from "$lib/playlist-tools/tools.svelte";

  // The library tools' app-wide pieces: their dialogs, opened from menus anywhere.
</script>

{#if tools.dialog?.kind === "tools"}
  {#key tools.dialog}<ToolsDialog source={tools.dialog.source} tab={tools.dialog.tab} />{/key}
{:else if tools.dialog?.kind === "import"}
  <ImportDialog />
{/if}
