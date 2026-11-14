<script lang="ts">
  import { delayLabel, MAX_OFFSET_MS, nudged, saveOffset } from "$lib/lyric-offsets";
  import { foundFor, sourcesFor, type Found } from "$lib/lyrics";
  import { copyLyrics, saveLyrics } from "$lib/lyrics/actions";
  import { chooseSource, isSource, SOURCE_NAMES, sourceChoice } from "$lib/lyrics/sources.svelte";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import BarPopover from "./BarPopover.svelte";
  import Icon from "./Icon.svelte";
  import Toggle from "./Toggle.svelte";

  // Cinema's lyrics options: this song's timing and source, keeping a copy, the text size and the
  // soft blur on distant lines. Size and blur are the same settings as in Settings, so they apply
  // to every lyrics view.
  let { offset = $bindable(0), synced }: { offset?: number; synced: boolean } = $props();

  const SIZE_STEP = 0.1;
  const MIN_SIZE = 0.75;
  const MAX_SIZE = 1.5;
  /** How long "Copy lyrics" says it did. */
  const COPIED_MS = 1_600;
  let found = $state.raw<Found | null>(null);
  let copied = $state(false);
  const sources = $derived(player.track ? sourcesFor(player.track) : []);
  const chosen = $derived(player.track ? sourceChoice(player.track.id) : undefined);
  const lyrics = $derived(found?.lyrics.kind === "synced" || found?.lyrics.kind === "plain" ? found.lyrics : null);

  // The same shared lookup as the lyrics view, which is the one that reports a failure.
  $effect(() => {
    const track = player.track;
    found = null;
    if (!track) return;
    let current = true;
    foundFor(track).then(
      (result) => current && (found = result),
      () => {},
    );
    return () => (current = false);
  });

  function pickSource(value: string) {
    if (player.track) chooseSource(player.track.id, isSource(value) ? value : undefined);
  }

  async function copy() {
    if (!lyrics || !(await copyLyrics(lyrics))) return;
    copied = true;
    setTimeout(() => (copied = false), COPIED_MS);
  }
  const scale = $derived(prefs.value?.lyricsScale ?? 1);
  const blur = $derived(prefs.value?.lyricsBlur ?? true);
  const offsetLabel = $derived(delayLabel(offset));

  /** -1 shows this song's lyrics earlier, 1 later, 0 resets. */
  function nudge(direction: -1 | 0 | 1) {
    if (player.track) offset = saveOffset(player.track.id, direction === 0 ? 0 : nudged(offset, direction));
  }

  const resize = (by: number) => prefs.update({ lyricsScale: Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, scale + by)) * 100) / 100 });
</script>

<BarPopover label="Lyrics options">
  {#snippet button()}<Icon name="lyrics" size={18} />{/snippet}
  <div class="options">
    <div class="row">
      <span class="name">Timing</span>
      <div class="stepper" role="group" aria-label="Lyrics timing for this song">
        <button onclick={() => nudge(-1)} disabled={!synced || offset >= MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds earlier" title="Earlier">−</button>
        <button class="value tabular" onclick={() => nudge(0)} disabled={!synced || offset === 0} aria-label="Lyrics delay {offsetLabel}. Reset" title="Reset">{offsetLabel}</button>
        <button onclick={() => nudge(1)} disabled={!synced || offset <= -MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds later" title="Later">+</button>
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
    {#if sources.length > 1}
      <label class="row">
        <span class="name">Source</span>
        <select value={chosen ?? ""} onchange={(e) => pickSource(e.currentTarget.value)} title="Where this song's lyrics come from">
          <option value="">{!chosen && found?.source ? `Best: ${SOURCE_NAMES[found.source]}` : "Best available"}</option>
          {#each sources as id (id)}<option value={id}>{SOURCE_NAMES[id]}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="keep">
      <button disabled={!lyrics} onclick={() => player.track && lyrics && saveLyrics(player.track, lyrics)}><Icon name="export" size={16} />Save lyrics…</button>
      <button disabled={!lyrics} onclick={copy}><Icon name={copied ? "check" : "duplicate"} size={16} />{copied ? "Copied" : "Copy lyrics"}</button>
    </div>
  </div>
</BarPopover>

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

  .row select {
    min-width: 0;
    height: 32px;
    border-radius: var(--r-pill);
    font-size: var(--fs-caption);
    font-weight: 600;
  }

  .keep {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
    padding-top: var(--sp-2);
    box-shadow: inset 0 1px 0 var(--glass-edge);
  }

  .keep button {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--glass);
    color: var(--text-muted);
    font-size: var(--fs-caption);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-press) var(--ease-out);
  }

  .keep button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-active);
  }

  .keep button:active:not(:disabled) {
    transform: scale(var(--press));
  }

  .keep button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .hint {
    margin: 0;
    font-size: var(--fs-caption);
    color: var(--text-muted);
  }
</style>
