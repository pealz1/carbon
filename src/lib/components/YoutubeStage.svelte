<script lang="ts">
  import { onMount } from "svelte";
  import { player } from "$lib/player.svelte";
  import { embed } from "$lib/youtube/embed";
  import { view } from "$lib/view.svelte";
  import { stage } from "$lib/youtube/stage.svelte";
  import Icon from "./Icon.svelte";

  // YouTube's player, always on screen while YouTube Music plays: over the artwork slot of Now
  // Playing or cinema mode, otherwise as a mini player above the dock. Mounted once in the layout;
  // only this box moves, never the frame inside it.
  let host = $state<HTMLElement>();
  let box = $state<DOMRect | null>(null);

  onMount(() => host && embed.mount(host));

  $effect(() => {
    const slot = stage.slot;
    if (!slot) return void (box = null);
    const measure = () => (box = slot.getBoundingClientRect());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  });

  const visible = $derived(player.source === "youtube");
</script>

<section
  class="stage"
  class:visible
  class:docked={!box}
  class:glass={!box}
  class:aside={view.lyrics}
  style:transform={box ? `translate3d(${box.left}px, ${box.top}px, 0)` : undefined}
  style:width={box ? `${box.width}px` : undefined}
  style:height={box ? `${box.height}px` : undefined}
  aria-label="YouTube player"
  aria-hidden={!visible}
  inert={!visible}
>
  {#if !box}
    <header class="bar">
      <span class="badge">YouTube Music</span>
      <span class="title">{player.track?.name ?? ""}</span>
      <a href="/now-playing" class="expand" aria-label="Show the video in Now Playing" title="Now Playing"><Icon name="expand" size={14} /></a>
    </header>
  {/if}
  <div class="frame" bind:this={host}></div>
</section>

<style>
  /* In a slot it's large artwork-sized video: 8 px corners, no frame. Docked it floats, so glass. */
  .stage {
    position: fixed;
    z-index: 41;
    left: 0;
    top: 0;
    display: flex;
    flex-direction: column;
    border-radius: var(--r-art);
    overflow: hidden;
    background: #000;
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }

  .stage.visible {
    visibility: visible;
    opacity: 1;
  }

  /* YouTube requires embedded players to be at least 200 x 200 px: 16:9 at 200 px tall. Docked
     above the player bar, clear of the lyrics panel when it's open. */
  .docked {
    --aside-w: 0px;
    z-index: 30;
    left: auto;
    top: auto;
    right: calc(var(--aside-w) + var(--inset) + var(--sp-4));
    bottom: calc(var(--player-h) + var(--sp-4));
    width: 356px;
    padding: 0 var(--sp-1) var(--sp-1);
    border-radius: var(--r-lg);
  }

  .docked.aside {
    --aside-w: var(--lyrics-w);
  }

  .docked .frame {
    height: 200px;
    flex: none;
    border-radius: var(--r-art);
    overflow: hidden;
    background: #000;
  }

  .frame {
    flex: 1;
    min-height: 0;
  }

  .frame :global(iframe) {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 34px;
    padding: 0 var(--sp-1) 0 var(--sp-2);
    font-size: var(--fs-small);
  }

  .badge {
    flex: none;
    font-weight: 700;
    color: var(--accent);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }

  .expand {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .expand:hover,
  .expand:focus-visible {
    color: var(--text);
    background: var(--glass-hover);
  }
</style>
