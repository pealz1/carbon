<script lang="ts">
  import { fly } from "svelte/transition";
  import { player } from "$lib/player.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import Icon from "./Icon.svelte";
  import Status from "./Status.svelte";
  import TrackList from "./TrackList.svelte";

  let { onclose }: { onclose: () => void } = $props();

  // Re-fetch when the current track changes; the queue isn't pushed by the SDK.
  const queue = resource(() => {
    void player.track?.uri;
    return sp.queue();
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<aside class="queue glass" transition:fly={{ x: 24, duration: 240 }} aria-label="Queue">
  <header>
    <h2>Up next</h2>
    <button onclick={onclose} aria-label="Close queue" title="Close"><Icon name="close" size={16} /></button>
  </header>
  {#if player.track}
    <h3>Now playing</h3>
    <TrackList tracks={[player.track]} compact />
  {/if}
  <h3>Next in queue</h3>
  <div class="list">
    {#if player.upNext}
      <TrackList tracks={player.upNext} compact />
    {:else if queue.data?.length}
      <TrackList tracks={queue.data} compact />
    {:else}
      <Status loading={queue.loading} error={queue.error} empty="Nothing queued." onretry={queue.reload} />
    {/if}
  </div>
</aside>

<style>
  .queue {
    position: absolute;
    top: var(--sp-2);
    right: var(--sp-2);
    bottom: var(--sp-2);
    z-index: 4;
    width: min(380px, calc(100% - var(--sp-4)));
    display: flex;
    flex-direction: column;
    padding: var(--sp-3) var(--sp-2) var(--sp-2);
    border-radius: var(--r-lg);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--sp-1) 0 var(--sp-3);
    margin-bottom: var(--sp-2);
  }

  h2 {
    font-size: var(--fs-section);
    font-weight: 700;
  }

  h3 {
    margin: var(--sp-3) var(--sp-3) var(--sp-1);
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0;
  }

  header button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  header button:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
