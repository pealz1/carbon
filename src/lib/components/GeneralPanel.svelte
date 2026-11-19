<script lang="ts">
  // Settings → General: where Carbon opens, your name, privacy, quitting, volume and the sleep timer.
  import { formatDuration } from "$lib/format";
  import type { StartupPage } from "$lib/native";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { regionChoices, regionName, systemRegion } from "$lib/region";
  import { SLEEP_PRESETS, sleepTimer } from "$lib/sleep-timer.svelte";
  import Toggle from "./Toggle.svelte";

  const PAGES: { id: StartupPage; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "library", label: "Library" },
    { id: "liked", label: "Liked Songs" },
    { id: "search", label: "Search" },
    { id: "last", label: "Where I left off" },
  ];
  const MAX_NAME = 40;
  const s = $derived(prefs.value);
  const remaining = $derived(sleepTimer.remainingMs);
  const regions = regionChoices();
  const detected = systemRegion();

  async function setCurve(on: boolean) {
    if (await prefs.update({ volumeCurve: on })) player.setVolume(player.volume);
  }
</script>

{#if s}
  <section class="panel plate">
    <h2>General</h2>
    <label class="field">
      <span class="label">Startup page</span>
      <select value={s.startupPage} onchange={(e) => prefs.update({ startupPage: e.currentTarget.value as StartupPage })}>
        {#each PAGES as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span class="label">Display name</span>
      <span class="muted">Used in the greeting on Home. Leave it empty to use your Spotify name.</span>
      <input
        class="input"
        value={s.displayName}
        maxlength={MAX_NAME}
        placeholder="Your name"
        spellcheck="false"
        onchange={(e) => prefs.update({ displayName: e.currentTarget.value.trim() })}
      />
    </label>
    <label class="field">
      <span class="label">Region</span>
      <span class="muted">For “Near you” in Radio. Carbon never asks for your location; Automatic uses your system's region.</span>
      <select value={s.region} onchange={(e) => prefs.update({ region: e.currentTarget.value })}>
        <option value="">Automatic{detected ? ` (${regionName(detected)})` : ""}</option>
        {#each regions as r (r.code)}<option value={r.code}>{r.name}</option>{/each}
      </select>
    </label>
    <Toggle
      checked={s.gameMode}
      label="Game mode"
      description="Holds effects at Minimal and stops all motion and the visualizer, to leave your PC's power for a game. Your own effects choice comes back when you turn it off."
      onchange={(v) => prefs.update({ gameMode: v })}
    />
    <Toggle
      checked={s.privateSession}
      label="Private session"
      description="Nothing goes to Discord, Last.fm, ListenBrainz or your listening history until you turn it off."
      onchange={(v) => prefs.update({ privateSession: v })}
    />
    <Toggle
      checked={s.confirmClose}
      disabled={s.closeToTray}
      label="Ask before quitting while music plays"
      description={s.closeToTray ? "Closing keeps Carbon playing in the tray, so there's nothing to ask. Turn off “Keep playing when closed” in System first." : "Closing the window while a song plays asks first."}
      onchange={(v) => prefs.update({ confirmClose: v })}
    />

    <p class="eyebrow">Volume</p>
    <label class="field">
      <span class="label">Scroll step <span class="value tabular">{Math.round(s.volumeStep * 100)}%</span></span>
      <span class="muted">How far one notch of the scroll wheel moves the volume, over the volume control.</span>
      <input
        type="range"
        min="0.01"
        max="0.25"
        step="0.01"
        value={s.volumeStep}
        aria-valuetext="{Math.round(s.volumeStep * 100)}%"
        onchange={(e) => prefs.update({ volumeStep: Number(e.currentTarget.value) })}
      />
    </label>
    <Toggle
      checked={s.volumeCurve}
      label="Finer control at low volume"
      description="A gradual curve: the bottom half of the slider covers quiet listening in small steps."
      onchange={setCurve}
    />

    <p class="eyebrow">Sleep timer</p>
    <p class="muted" role="status">
      {sleepTimer.current?.kind === "song" ? "Pausing at the end of this song." : remaining !== null ? `Pausing in ${formatDuration(remaining)}.` : "Pauses the music after a while. Nothing fades."}
    </p>
    <div class="sleep">
      {#each SLEEP_PRESETS as minutes (minutes)}
        <button class="pill" onclick={() => sleepTimer.start(minutes)}>{minutes === 60 ? "1h" : `${minutes}m`}</button>
      {/each}
      <button class="pill" disabled={!player.track} onclick={() => sleepTimer.endOfSong()}>End of song</button>
      {#if sleepTimer.current}<button class="pill ghost" onclick={() => sleepTimer.cancel()}>Turn off</button>{/if}
    </div>
  </section>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  h2 {
    margin-bottom: var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .eyebrow {
    margin: var(--sp-3) 0 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .label {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
  }

  .value {
    color: var(--accent);
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .sleep {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
