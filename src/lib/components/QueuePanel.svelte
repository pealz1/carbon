<script lang="ts">
  import { fly } from "svelte/transition";
  import { player } from "$lib/player.svelte";
  import { resource } from "$lib/resource.svelte";
  import { services } from "$lib/services.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import Icon from "./Icon.svelte";
  import Status from "./Status.svelte";
  import TrackList from "./TrackList.svelte";
  import { specular } from "$lib/liquid";

  let { onclose }: { onclose: () => void } = $props();

  // Re-fetch when the current track changes; the queue isn't pushed by the SDK.
  const queue = resource(() => {
    void player.track?.uri;
    return services.active.spotify ? sp.queue() : Promise.resolve([]); // never asks Spotify when it isn't connected
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<aside class="queue liquid" use:specular transition:fly={{ x: 40, duration: 260 }} aria-label="Queue">
  <header>
    <h2>Up next</h2>
    <button onclick={onclose} aria-label="Close queue"><Icon name="close" size={16} /></button>
  </header>
  {#if player.track}
    <p class="eyebrow">Now playing</p>
    <TrackList tracks={[player.track]} compact />
  {/if}
  <p class="eyebrow">Next in queue</p>
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
    right: var(--sp-4);
    bottom: calc(var(--dock-h) + var(--sp-5));
    z-index: 4;
    width: 360px;
    display: flex;
    flex-direction: column;
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    --glass: var(--glass-strong);
    --glass-blur: var(--glass-blur-heavy);
    box-shadow: var(--shadow-float);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-3);
  }

  h2 {
    font-size: var(--fs-section);
  }

  header button {
    padding: var(--sp-1);
    border-radius: var(--r-sm);
    color: var(--text-muted);
  }

  header button:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .eyebrow {
    margin: var(--sp-3) 0 var(--sp-2);
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
