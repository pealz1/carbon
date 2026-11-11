<script lang="ts">
  import { onMount } from "svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { sound } from "$lib/local/sound.svelte";
  import type { SpotifyEqStatus } from "$lib/local/spotifyEq";

  const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const MAX_DB = 12;
  const CURVE_W = 1000;
  const CURVE_H = 240;
  const SPAN = Math.log(1000); // 20 Hz to 20 kHz
  const CROSSFADE_MAX = 12;

  const EQ_STATUS: Record<SpotifyEqStatus, string> = {
    off: "Off. Spotify plays exactly as Spotify sends it.",
    restart: "Restart Carbon to switch this on.",
    waiting: "On. Waiting for Spotify's player to start.",
    ready: "On. Waiting for Spotify's player to start.",
    active: "Active on Spotify's audio.",
    protected: "Spotify's audio is copy-protected here, so it was left untouched.",
    silent: "The EQ silenced Spotify's audio, so it was switched off.",
    failed: "Couldn't attach to Spotify's player, so it was switched off.",
  };

  const s = $derived(sound.value);
  const xOf = (hz: number) => Math.log(hz / 20) / SPAN;
  const yOf = (db: number) => CURVE_H / 2 - (Math.max(-MAX_DB, Math.min(MAX_DB, db)) / MAX_DB) * (CURVE_H / 2 - 8);
  const line = $derived(sound.curve.map((db, i) => `${i ? "L" : "M"}${((i / (sound.curve.length - 1)) * CURVE_W).toFixed(1)} ${yOf(db).toFixed(1)}`).join(" "));
  const area = $derived(line && `${line} L${CURVE_W} ${CURVE_H / 2} L0 ${CURVE_H / 2} Z`);
  const label = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));
  const signed = (db: number) => `${db > 0 ? "+" : ""}${db.toFixed(db % 1 ? 1 : 0)}`;

  onMount(() => void Promise.all([sound.boot(), sound.loadDevices()]));
</script>

<header class="page-head">
  <h1>Sound</h1>
  <p class="lede">Shapes local files played by Carbon's own engine. Spotify's audio is left as Spotify sends it.</p>
</header>

{#if sound.error}<p class="warn" role="alert">{sound.error}</p>{/if}

{#if s}
  <section class="eq plate" aria-label="Equalizer">
    <div class="presets segmented" role="radiogroup" aria-label="EQ preset">
      {#each sound.presets as p (p.id)}
        <button role="radio" aria-checked={s.preset === p.id} class:active={s.preset === p.id} onclick={() => sound.applyPreset(p.id)}>{p.name}</button>
      {/each}
      <button role="radio" aria-checked={s.preset === "custom"} class:active={s.preset === "custom"} onclick={() => sound.applyPreset("custom")}>Custom</button>
    </div>

    <div class="board">
      <div class="preamp">
        <span class="value tabular">{signed(s.preampDb)}</span>
        <input
          type="range"
          min={-MAX_DB}
          max={MAX_DB}
          step="0.5"
          value={s.preampDb}
          aria-label="Preamp"
          aria-valuetext="{signed(s.preampDb)} dB"
          oninput={(e) => sound.update({ preampDb: Number(e.currentTarget.value) })}
        />
        <span class="hz">Pre</span>
      </div>

      <div class="field">
        <svg viewBox="0 0 {CURVE_W} {CURVE_H}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style="stop-color: var(--accent); stop-opacity: 0.38" />
              <stop offset="50%" style="stop-color: var(--accent); stop-opacity: 0.04" />
              <stop offset="100%" style="stop-color: var(--accent); stop-opacity: 0.38" />
            </linearGradient>
          </defs>
          {#each [-MAX_DB, -6, 0, 6, MAX_DB] as db (db)}
            <line class:zero={db === 0} x1="0" x2={CURVE_W} y1={yOf(db)} y2={yOf(db)} />
          {/each}
          {#if area}<path class="area" d={area} />{/if}
          {#if line}<path class="curve" d={line} />{/if}
        </svg>
        {#each FREQUENCIES as hz, band (hz)}
          <div class="band" style="left: {xOf(hz) * 100}%">
            <span class="value tabular">{signed(s.bands[band])}</span>
            <input
              type="range"
              min={-MAX_DB}
              max={MAX_DB}
              step="0.5"
              value={s.bands[band]}
              aria-label="{label(hz)}Hz"
              aria-valuetext="{signed(s.bands[band])} dB"
              oninput={(e) => sound.setBand(band, Number(e.currentTarget.value))}
              ondblclick={() => sound.setBand(band, 0)}
            />
            <span class="hz">{label(hz)}</span>
          </div>
        {/each}
      </div>
    </div>
    <p class="fine">Double-click a band to reset it. A limiter keeps boosts from clipping.</p>
  </section>

  <div class="grid">
    <section class="panel plate">
      <h2>Playback</h2>
      <Toggle
        checked={s.normalize}
        label="Even out loudness"
        description="Uses ReplayGain tags when a file has them, otherwise measures the file once and remembers it. Local files only."
        onchange={(v) => sound.update({ normalize: v })}
      />
      <label class="range">
        <span class="row"><span class="label">Crossfade</span><span class="tabular muted">{s.crossfadeSecs ? `${s.crossfadeSecs} s` : "Off"}</span></span>
        <input type="range" min="0" max={CROSSFADE_MAX} step="1" value={s.crossfadeSecs} oninput={(e) => sound.update({ crossfadeSecs: Number(e.currentTarget.value) })} />
        <span class="muted">Crossfade applies to local files. Spotify songs always stop before the next song starts. Albums stay gapless.</span>
      </label>
      <label class="range">
        <span class="row"><span class="label">Stereo width</span><span class="tabular muted">{Math.round(s.width * 100)}%</span></span>
        <input type="range" min="0" max="2" step="0.05" value={s.width} oninput={(e) => sound.update({ width: Number(e.currentTarget.value) })} />
      </label>
    </section>

    <section class="panel plate">
      <h2>Output</h2>
      <label class="range">
        <span class="label">Play local files through</span>
        <select value={s.device} onchange={(e) => sound.update({ device: e.currentTarget.value })}>
          <option value="">Windows default (follows changes)</option>
          {#each sound.devices as device (device)}
            <option value={device}>{device}</option>
          {/each}
          {#if s.device && !sound.devices.includes(s.device)}<option value={s.device}>{s.device} (not connected)</option>{/if}
        </select>
      </label>
      <p class="muted">If this device disconnects, Carbon switches to the Windows default and keeps playing.</p>
    </section>

    <section class="panel plate experimental">
      <h2>EQ on Spotify audio</h2>
      <p class="flag" role="note">Experimental — may stop working or conflict with Spotify's terms</p>
      <Toggle
        checked={s.spotifyEq}
        label="Apply this EQ to Spotify"
        description="Off by default. Takes effect after restarting Carbon. If Spotify's audio is copy-protected, Carbon leaves it untouched and switches this off."
        onchange={(v) => sound.update({ spotifyEq: v })}
      />
      <p class="status" role="status">{EQ_STATUS[sound.spotifyEq]}</p>
      {#if sound.bypassNote}<p class="warn">{sound.bypassNote}</p>{/if}
    </section>
  </div>
{/if}

<style>
  .page-head {
    justify-content: space-between;
    gap: var(--sp-4) var(--sp-6);
  }

  .lede {
    max-width: 44ch;
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .warn {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .eq {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--sp-5) var(--sp-4);
    border-radius: var(--r-lg);
  }

  .presets > button {
    padding: 0 var(--sp-3);
    font-size: var(--fs-small);
  }

  .board {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: var(--sp-4);
    height: 300px;
  }

  .preamp,
  .band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }

  .preamp {
    padding-right: var(--sp-4);
    border-right: 1px solid var(--glass-edge);
  }

  .field {
    position: relative;
    margin: 0 var(--sp-3);
  }

  svg {
    position: absolute;
    inset: 28px 0 28px;
    width: 100%;
    height: calc(100% - 56px);
    overflow: visible;
  }

  line {
    stroke: var(--glass-edge);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  line.zero {
    stroke: var(--glass-edge-top);
    stroke-dasharray: 4 6;
  }

  .area {
    fill: url(#eq-fill);
  }

  .curve {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .band {
    position: absolute;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
  }

  .value {
    height: 20px;
    font-size: var(--fs-micro);
    font-weight: 700;
    color: var(--text-muted);
  }

  .hz {
    height: 20px;
    font-size: var(--fs-micro);
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }

  /* Vertical faders: native range inputs turned upright, so keyboard and screen readers just work. */
  .preamp input,
  .band input {
    flex: 1;
    width: 28px;
    margin: 0;
    writing-mode: vertical-lr;
    direction: rtl;
    appearance: none;
    background: none;
    cursor: pointer;
  }

  .preamp input::-webkit-slider-runnable-track,
  .band input::-webkit-slider-runnable-track {
    width: 4px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.12);
  }

  .preamp input::-webkit-slider-thumb,
  .band input::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 12px;
    margin-left: -9px;
    border-radius: var(--r-pill);
    background: var(--text);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.6);
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .preamp input:hover::-webkit-slider-thumb,
  .band input:hover::-webkit-slider-thumb {
    transform: scale(1.12);
  }

  .preamp input:focus-visible,
  .band input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--r-pill);
  }

  .fine {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--sp-4);
    align-items: start;
    margin-top: var(--sp-4);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
  }

  h2 {
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .range {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .row {
    display: flex;
    justify-content: space-between;
  }

  .label {
    font-weight: 600;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .range input {
    accent-color: var(--accent);
  }

  .experimental {
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--warning) 45%, transparent);
  }

  .flag {
    align-self: flex-start;
    margin: 0;
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-pill);
    background: color-mix(in oklch, var(--warning) 12%, transparent);
    color: var(--warning);
    font-size: var(--fs-small);
    font-weight: 650;
  }

  .status {
    margin: 0;
    font-size: var(--fs-small);
    color: var(--text-muted);
  }
</style>
