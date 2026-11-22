<script lang="ts">
  // Player bar: where the sound goes and how it sounds. The output device (Windows), Boost, Bass
  // and Treble, one click from anywhere, with the full equalizer a link away.
  import { t } from "$lib/i18n/locale.svelte";
  import { sound } from "$lib/local/sound.svelte";
  import { output } from "$lib/output.svelte";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";
  import Toggle from "./Toggle.svelte";

  const TONE_MAX = 12;
  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  const s = $derived(sound.value);
  const signed = (db: number) => `${db > 0 ? "+" : ""}${db.toFixed(db % 1 ? 1 : 0)}`;
  const label = $derived(output.current ? `${t("Output")}: ${output.current.name}` : t("Sound"));
</script>

<button bind:this={button} class="ctl" class:on={!!s?.boost} onclick={() => (open = !open)} aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label}>
  <Icon name="speaker" size={18} />
</button>

{#if open && button}
  <Popover anchor={button} label="Sound" onclose={() => (open = false)}>
    {#if output.devices.length}
      <section>
        <h2>Output</h2>
        <ul role="radiogroup" aria-label="Output device">
          {#each output.devices as device (device.id)}
            <li>
              <button role="radio" aria-checked={device.isDefault} class="device" class:on={device.isDefault} onclick={() => output.select(device.id)}>
                <span class="mark">{#if device.isDefault}<Icon name="check" size={14} />{/if}</span>
                <span class="name">{device.name}</span>
              </button>
            </li>
          {/each}
        </ul>
        <Toggle checked={output.auto} label="Switch to new devices" onchange={output.setAuto} />
        <p class="hint">Changes the output for all of Windows</p>
      </section>
    {/if}

    {#if s}
      <section>
        <header class="row">
          <h2>Tone</h2>
          <button class="pill boost" class:accent={s.boost} aria-pressed={s.boost} onclick={() => sound.update({ boost: !s.boost })} title="Louder than 100%, through a limiter">
            <Icon name="spark" size={14} /> Boost
          </button>
        </header>
        {#each [{ id: "bass", name: "Bass", value: sound.bass }, { id: "treble", name: "Treble", value: sound.treble }] as const as tone (tone.id)}
          <label class="tone">
            <span class="name">{tone.name}</span>
            <input type="range" min={-TONE_MAX} max={TONE_MAX} step="0.5" value={tone.value} aria-valuetext="{signed(tone.value)} dB" oninput={(e) => sound.setTone(tone.id, Number(e.currentTarget.value))} ondblclick={() => sound.setTone(tone.id, 0)} />
            <span class="db tabular">{signed(tone.value)}</span>
          </label>
        {/each}
        <Toggle checked={s.spotifyEq} label="Also shape Spotify and YouTube Music" onchange={(v) => sound.update({ spotifyEq: v })} />
        <a class="pill ghost eq" href="/sound" onclick={() => (open = false)}><Icon name="equalizer" size={15} /> Equalizer</a>
      </section>
    {/if}
  </Popover>
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  section + section {
    padding-top: var(--sp-3);
    border-top: 1px solid var(--glass-edge);
  }

  h2 {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 208px;
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .device {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 34px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text-muted);
    text-align: left;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .device:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .device.on {
    color: var(--text);
    font-weight: 650;
  }

  .mark {
    flex: none;
    width: 16px;
    display: grid;
    place-items: center;
    color: var(--accent);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-caption);
  }

  .boost {
    height: 30px;
    padding: 0 var(--sp-3);
    font-size: var(--fs-small);
  }

  .tone {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 34px;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 600;
  }

  .tone input {
    accent-color: var(--accent);
  }

  .db {
    color: var(--text-muted);
    font-size: var(--fs-small);
    text-align: right;
  }

  .eq {
    align-self: stretch;
    margin-top: var(--sp-1);
  }
</style>
