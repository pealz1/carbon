<script lang="ts">
  import { MAX_OFFSET_MS, OFFSET_STEP_MS, saveOffset } from "$lib/lyric-offsets";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";
  import Toggle from "./Toggle.svelte";

  // Cinema's lyrics options: this song's timing, the text size and the soft blur on distant lines.
  // Size and blur are the same settings as in Settings, so they apply to every lyrics view.
  let { offset = $bindable(0), synced, open = $bindable(false) }: { offset?: number; synced: boolean; open?: boolean } = $props();

  const SIZE_STEP = 0.1;
  const MIN_SIZE = 0.75;
  const MAX_SIZE = 1.5;
  const scale = $derived(prefs.value?.lyricsScale ?? 1);
  const blur = $derived(prefs.value?.lyricsBlur ?? true);
  const offsetLabel = $derived(`${offset > 0 ? "+" : offset < 0 ? "−" : "±"}${(Math.abs(offset) / 1000).toFixed(2)} s`);

  function nudge(by: number) {
    if (player.track) offset = saveOffset(player.track.id, by === 0 ? 0 : offset + by);
  }

  const resize = (by: number) => prefs.update({ lyricsScale: Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, scale + by)) * 100) / 100 });
</script>

<Popover label="Lyrics options" bind:open>
  {#snippet button()}<Icon name="lyrics" size={18} />{/snippet}
  <div class="options">
    <div class="row">
      <span class="name">Timing</span>
      <div class="stepper" role="group" aria-label="Lyrics timing for this song">
        <button onclick={() => nudge(-OFFSET_STEP_MS)} disabled={!synced || offset <= -MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds earlier" title="Earlier">−</button>
        <button class="value tabular" onclick={() => nudge(0)} disabled={!synced || offset === 0} aria-label="Lyrics offset {offsetLabel}. Reset" title="Reset">{offsetLabel}</button>
        <button onclick={() => nudge(OFFSET_STEP_MS)} disabled={!synced || offset >= MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds later" title="Later">+</button>
      </div>
    </div>
    <div class="row">
      <span class="name">Text size</span>
      <div class="stepper" role="group" aria-label="Lyrics size">
        <button onclick={() => resize(-SIZE_STEP)} disabled={scale <= MIN_SIZE} aria-label="Smaller lyrics" title="Smaller">A−</button>
        <span class="value tabular" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button onclick={() => resize(SIZE_STEP)} disabled={scale >= MAX_SIZE} aria-label="Larger lyrics" title="Larger">A+</button>
      </div>
    </div>
    <Toggle checked={blur} label="Soften distant lines" onchange={(on) => prefs.update({ lyricsBlur: on })} />
    {#if !synced}<p class="hint">Timing works on synced lyrics.</p>{/if}
  </div>
</Popover>

<style>
  .options {
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: 0 var(--sp-1);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .name {
    font-weight: 600;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
  }

  .stepper button,
  .stepper .value {
    min-width: 32px;
    height: 28px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-weight: 700;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .stepper .value {
    min-width: 64px;
    display: grid;
    place-items: center;
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--text);
  }

  .stepper button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-hover);
  }

  .stepper button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .hint {
    margin: 0;
    font-size: var(--fs-caption);
    color: var(--text-muted);
  }
</style>
