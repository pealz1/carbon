<script lang="ts">
  // Settings → Accessibility: text weight and size, how much things move, and contrast.
  import type { Motion } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Toggle from "./Toggle.svelte";

  const MOTIONS: { id: Motion; label: string; hint: string }[] = [
    { id: "none", label: "None", hint: "Nothing moves: no springs, transitions or animation" },
    { id: "normal", label: "Normal", hint: "Soft springs on press and hover" },
    { id: "playful", label: "Playful", hint: "Deeper presses and a bouncier spring" },
  ];
  const s = $derived(prefs.value);
</script>

{#if s}
  <section class="panel plate">
    <h2>Accessibility</h2>
    <p class="eyebrow">Text</p>
    <Toggle checked={s.boldText} label="Bold text" description="Heavier text throughout Carbon, for easier reading." onchange={(v) => prefs.update({ boldText: v })} />
    <label class="range">
      <span class="label">Interface scale <span class="value tabular">{Math.round(s.uiScale * 100)}%</span></span>
      <span class="muted">Scales text and controls in the main window. Pop-out windows keep their size.</span>
      <input
        type="range"
        min="0.8"
        max="1.5"
        step="0.05"
        value={s.uiScale}
        aria-valuetext="{Math.round(s.uiScale * 100)}%"
        onchange={(e) => prefs.update({ uiScale: Number(e.currentTarget.value) })}
      />
    </label>

    <p class="eyebrow">Motion</p>
    <div class="segmented" role="radiogroup" aria-label="Motion">
      {#each MOTIONS as m (m.id)}
        <button role="radio" aria-checked={s.motion === m.id} class:active={s.motion === m.id} title={m.hint} onclick={() => prefs.update({ motion: m.id })}>{m.label}</button>
      {/each}
    </div>
    <Toggle
      checked={s.cardHover}
      disabled={s.motion === "none"}
      label="Card hover motion"
      description="Album, artist and playlist tiles swell when you point at them and press in when clicked."
      onchange={(v) => prefs.update({ cardHover: v })}
    />

    <p class="eyebrow">Visibility</p>
    <Toggle checked={s.highContrast} label="High contrast" description="Brighter secondary text, firmer edges and more solid panels." onchange={(v) => prefs.update({ highContrast: v })} />
    <Toggle
      checked={s.focusRing}
      label="Always show focus ring"
      description="Outlines whatever has focus after a click too, not only when you use the keyboard."
      onchange={(v) => prefs.update({ focusRing: v })}
    />
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

  .range {
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
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }
</style>
