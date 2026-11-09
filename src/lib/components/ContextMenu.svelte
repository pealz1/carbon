<script lang="ts">
  import { menu } from "$lib/menu.svelte";
  import MenuPanel from "./MenuPanel.svelte";

  // Closes on a click elsewhere, scrolling the page, resizing or leaving the window.
  const outside = (event: Event) => !(event.target as Element | null)?.closest?.(".menu-panel");

  $effect(() => {
    if (!menu.current) return;
    const onScroll = (event: Event) => outside(event) && menu.close(false);
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  });
</script>

<svelte:window
  onpointerdown={(e) => menu.current && outside(e) && menu.close(false)}
  onresize={() => menu.current && menu.close(false)}
  onblur={() => menu.current && menu.close(false)}
/>

{#if menu.current}
  {#key menu.current}
    <MenuPanel items={menu.current.items} x={menu.current.x} y={menu.current.y} onclose={() => menu.close()} />
  {/key}
{/if}
