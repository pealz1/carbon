<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "$lib/components/Icon.svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import { joinNames } from "$lib/format";
  import { mirror } from "$lib/popout/mirror.svelte";

  // Lyrics in their own always-on-top window, following the main window's player.
  const close = () => getCurrentWindow().close().catch((e) => console.error("[lyrics] close", e));
</script>

<svelte:head><title>Carbon lyrics</title></svelte:head>

<div class="window">
  <header data-tauri-drag-region="deep">
    {#if mirror.track?.album?.image}<img src={mirror.track.album.image} alt="" width="36" height="36" draggable="false" />{/if}
    <div class="meta">
      <p class="title">{mirror.track?.name ?? "Lyrics"}</p>
      {#if mirror.track}<p class="sub">{joinNames(mirror.track.artists)}</p>{/if}
    </div>
    <button class="tool" onclick={mirror.showMain} aria-label="Open Carbon" title="Open Carbon"><Icon name="expand" size={14} /></button>
    <button class="tool" onclick={close} aria-label="Close the lyrics window" title="Close"><Icon name="close" size={14} /></button>
  </header>
  <main>
    {#if mirror.track}
      <Lyrics variant="panel" source={mirror} />
    {:else}
      <p class="idle">Lyrics show up here when something plays.</p>
    {/if}
  </main>
</div>

<style>
  .window {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: flex;
    flex-direction: column;
    color: var(--chrome-text);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-2) var(--sp-2) var(--sp-3);
  }

  img {
    flex: none;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .meta {
    flex: 1;
    min-width: 0;
  }

  .title,
  .sub {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    font-size: var(--fs-body);
    font-weight: 650;
  }

  .sub {
    font-size: var(--fs-caption);
    color: var(--chrome-text-muted);
  }

  .tool {
    flex: none;
    align-self: flex-start;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--chrome-text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .tool:hover {
    color: var(--chrome-text);
    background: var(--chrome-hover);
  }

  main {
    flex: 1;
    min-height: 0;
    padding: 0 var(--sp-2) 0 var(--sp-3);
  }

  .idle {
    margin: var(--sp-5) var(--sp-2);
    color: var(--chrome-text-muted);
    font-size: var(--fs-body);
    line-height: 1.5;
  }
</style>
