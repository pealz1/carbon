<script lang="ts">
  // Player bar: the sleep timer's button (with the time left while it runs) and its popover.
  import { formatDuration } from "$lib/format";
  import { player } from "$lib/player.svelte";
  import { MAX_SLEEP_MINUTES, parseMinutes, SLEEP_PRESETS, sleepTimer } from "$lib/sleep-timer.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  let invalid = $state(false);
  const remaining = $derived(sleepTimer.remainingMs);
  const label = $derived(remaining === null ? "Sleep timer" : `Sleep timer: ${formatDuration(remaining)} left`);

  function choose(start: () => void) {
    start();
    open = false;
  }

  function startCustom(event: SubmitEvent) {
    event.preventDefault();
    const minutes = parseMinutes(String(new FormData(event.currentTarget as HTMLFormElement).get("minutes") ?? ""));
    invalid = minutes === null;
    if (minutes !== null) choose(() => sleepTimer.start(minutes));
  }
</script>

<button
  bind:this={button}
  class="ctl sleep"
  class:on={remaining !== null}
  onclick={() => (open = !open)}
  aria-label={label}
  aria-haspopup="dialog"
  aria-expanded={open}
  title={label}
>
  <Icon name="moon" size={18} />
  {#if remaining !== null}<span class="left tabular">{formatDuration(remaining)}</span>{/if}
</button>

{#if open && button}
  <Popover anchor={button} label="Sleep timer" onclose={() => (open = false)}>
    <header>
      <h2>Sleep timer</h2>
      {#if sleepTimer.current}
        <p class="status">
          {sleepTimer.current.kind === "song" ? "Pausing at the end of this song" : `Pausing in ${formatDuration(remaining ?? 0)}`}
        </p>
      {:else}
        <p class="muted">Pauses the music. Nothing fades.</p>
      {/if}
    </header>
    <div class="presets">
      {#each SLEEP_PRESETS as minutes (minutes)}
        <button class="pill" onclick={() => choose(() => sleepTimer.start(minutes))}>{minutes === 60 ? "1 hour" : `${minutes} min`}</button>
      {/each}
      <button class="pill" disabled={!player.track} onclick={() => choose(() => sleepTimer.endOfSong())}>End of song</button>
    </div>
    <form class="custom" novalidate onsubmit={startCustom}>
      <label class="eyebrow" for="sleep-minutes">Minutes</label>
      <input
        id="sleep-minutes"
        class="input"
        type="number"
        inputmode="numeric"
        min="1"
        max={MAX_SLEEP_MINUTES}
        placeholder="90"
        name="minutes"
        oninput={() => (invalid = false)}
        aria-invalid={invalid}
        aria-describedby={invalid ? "sleep-hint" : undefined}
      />
      <button class="pill accent" type="submit">Start</button>
    </form>
    {#if invalid}<p id="sleep-hint" class="warn" role="alert">Pick a whole number of minutes, up to {MAX_SLEEP_MINUTES}.</p>{/if}
    {#if sleepTimer.current}
      <button class="pill ghost" onclick={() => choose(() => sleepTimer.cancel())}>Turn off timer</button>
    {/if}
  </Popover>
{/if}

<style>
  .ctl.sleep {
    width: auto;
    min-width: 36px;
    grid-auto-flow: column;
    gap: var(--sp-1);
    padding: 0 var(--sp-2);
  }

  .left {
    font-size: var(--fs-caption);
    font-weight: 650;
  }

  /* Narrower windows keep the bar tidy: the time left is in the tooltip and the popover. */
  @media (max-width: 1400px) {
    .left {
      display: none;
    }
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h2 {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .status,
  .muted,
  .warn {
    margin: 0;
    font-size: var(--fs-small);
  }

  .status {
    color: var(--accent);
    font-weight: 600;
  }

  .muted {
    color: var(--text-muted);
  }

  .warn {
    color: var(--warning);
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .presets .pill {
    height: 32px;
    padding: 0 var(--sp-3);
  }

  .custom {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .custom .input {
    width: 88px;
    font-variant-numeric: tabular-nums;
  }

  .custom .eyebrow {
    margin-right: auto;
  }
</style>
