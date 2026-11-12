<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import MiniPlayer from "$lib/components/MiniPlayer.svelte";
  import { mirror } from "$lib/popout/mirror.svelte";

  const close = () => getCurrentWindow().close().catch((e) => console.error("[mini] close", e));
</script>

<svelte:head><title>Carbon mini player</title></svelte:head>

<MiniPlayer now={mirror} expandLabel="Open Carbon" onexpand={mirror.showMain} onclose={close} />
