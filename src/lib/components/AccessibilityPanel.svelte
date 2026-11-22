<script lang="ts">
  // Settings → Accessibility: text weight and size, how much things move, and contrast.
  import { t } from "$lib/i18n/locale.svelte";
  import type { Motion } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";
  import Toggle from "./Toggle.svelte";

  const MOTIONS: { id: Motion; label: string; hint: string }[] = [
    { id: "none", label: "None", hint: "Nothing moves" },
    { id: "normal", label: "Normal", hint: "Soft springs on press and hover" },
    { id: "playful", label: "Playful", hint: "Deeper presses and a bouncier spring" },
  ];
  const s = $derived(prefs.value);
  const scale = $derived(`${Math.round((s?.uiScale ?? 1) * 100)}%`);
</script>

{#if s}
  <Group heading="Text">
    <Toggle checked={s.boldText} label="Bold text" keywords="heavier weight readable" onchange={(v) => prefs.update({ boldText: v })} />
    <Row as="label" label="Interface scale" value={scale} description="Pop-out windows keep their size." keywords="zoom size bigger larger text">
      <input type="range" min="0.8" max="1.5" step="0.05" value={s.uiScale} aria-valuetext={scale} onchange={(e) => prefs.update({ uiScale: Number(e.currentTarget.value) })} />
    </Row>
  </Group>

  <Group heading="Motion">
    <Row label="Motion" keywords="animation reduce reduced transitions">
      <div class="segmented" role="radiogroup" aria-label="Motion">
        {#each MOTIONS as m (m.id)}
          <button role="radio" aria-checked={s.motion === m.id} class:active={s.motion === m.id} title={t(m.hint)} onclick={() => prefs.update({ motion: m.id })}>{t(m.label)}</button>
        {/each}
      </div>
    </Row>
    <Toggle
      checked={s.cardHover}
      disabled={s.motion === "none"}
      label="Card hover motion"
      description="Tiles swell on hover and press in."
      keywords="animation tiles albums"
      onchange={(v) => prefs.update({ cardHover: v })}
    />
  </Group>

  <Group heading="Visibility">
    <Toggle checked={s.highContrast} label="High contrast" description="Brighter text, firmer edges." keywords="contrast legibility" onchange={(v) => prefs.update({ highContrast: v })} />
    <Toggle
      checked={s.focusRing}
      label="Always show focus ring"
      description="After clicks too, not only the keyboard."
      keywords="outline keyboard focus"
      onchange={(v) => prefs.update({ focusRing: v })}
    />
  </Group>
{/if}
