<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import Ambient from "$lib/components/Ambient.svelte";
  import { mirror } from "$lib/popout/mirror.svelte";
  import { prefs } from "$lib/preferences.svelte";

  // Pop-out windows (mini player, lyrics): no player, no services, just a mirror of the main
  // window's player on the same artwork-coloured wallpaper, in the listener's accent and fonts.
  let { children }: { children: Snippet } = $props();

  onMount(() => {
    prefs.load().catch((e) => console.error("[popout] settings", e));
    const following = prefs.follow();
    const disconnect = mirror.connect();
    return () => {
      disconnect();
      void following.then((stop) => stop());
    };
  });
</script>

<Ambient image={mirror.track?.album?.image ?? null} playing={!mirror.paused} />
{@render children()}
