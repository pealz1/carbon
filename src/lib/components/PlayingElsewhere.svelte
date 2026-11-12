<script lang="ts">
  // Under the player bar's song: where Spotify is playing when that isn't Carbon.
  import { devices } from "$lib/devices.svelte";
  import { player } from "$lib/player.svelte";
  import Icon from "./Icon.svelte";
</script>

{#if devices.remote && player.source === "spotify"}
  <span class="elsewhere"><Icon name="devices" size={13} />Playing on {devices.remote.name}</span>
{/if}

<style>
  .elsewhere {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-width: 0;
    overflow: hidden;
    color: var(--accent);
    font-size: var(--fs-caption);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
