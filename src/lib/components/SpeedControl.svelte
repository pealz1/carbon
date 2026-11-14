<script lang="ts">
  // Player bar: playback speed, for the players that can change it (YouTube Music, your own
  // server, local files). Spotify's player has no speed, so the control isn't there for it.
  import { player, SPEEDS } from "$lib/player.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  const changed = $derived(player.rate !== 1);
  const text = (rate: number) => `${rate}×`;
  const label = $derived(changed ? `Speed: ${text(player.rate)}` : "Speed");
</script>

{#if player.speedable}
  <button bind:this={button} class="ctl speed" class:on={changed} onclick={() => (open = !open)} aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label}>
    <Icon name="speed" size={18} />
    {#if changed}<span class="now tabular">{text(player.rate)}</span>{/if}
  </button>

  {#if open && button}
    <Popover anchor={button} label="Playback speed" onclose={() => (open = false)}>
      <header>
        <h2>Speed</h2>
        <p class="muted">Pitch follows speed. Stays until you change it back.</p>
      </header>
      <div class="segmented" role="radiogroup" aria-label="Playback speed">
        {#each SPEEDS as rate (rate)}
          <button role="radio" aria-checked={player.rate === rate} class:active={player.rate === rate} onclick={() => player.setRate(rate)}>{text(rate)}</button>
        {/each}
      </div>
    </Popover>
  {/if}
{/if}

<style>
  .ctl.speed {
    width: auto;
    min-width: 36px;
    grid-auto-flow: column;
    gap: var(--sp-1);
    padding: 0 var(--sp-2);
  }

  .now {
    font-size: var(--fs-caption);
    font-weight: 650;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin-bottom: var(--sp-3);
  }

  h2 {
    font-size: var(--fs-body);
    font-weight: 700;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
