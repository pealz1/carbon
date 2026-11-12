<script lang="ts">
  // The player bar's playback tools.
  import SleepTimer from "./SleepTimer.svelte";
</script>

<div class="tools">
  <SleepTimer />
</div>

<style>
  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }

  /* Same controls as the rest of the player bar (NowPlayingBar.svelte); :where keeps them easy to extend. */
  :where(.tools) :global(.ctl) {
    position: relative;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--chrome-text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  :where(.tools) :global(.ctl:hover) {
    color: var(--chrome-text);
    background: var(--chrome-hover);
  }

  :where(.tools) :global(.ctl.on) {
    color: var(--accent);
  }
</style>
