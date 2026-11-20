<script lang="ts" module>
  import type { Theme } from "$lib/native";

  export const THEME_INFO: Record<Theme, { label: string; hint: string }> = {
    dynamic: { label: "Dynamic", hint: "Takes its colour from what's playing" },
    dark: { label: "Dark", hint: "Graphite, the same every song" },
    oled: { label: "OLED black", hint: "True black, easy on OLED screens" },
    light: { label: "Light", hint: "Ink on warm paper" },
    midnight: { label: "Midnight", hint: "Deep blue-black" },
    mocha: { label: "Mocha", hint: "Warm espresso brown" },
    forest: { label: "Forest", hint: "Dark pine green" },
  };
</script>

<script lang="ts">
  import { t } from "$lib/i18n/locale.svelte";
  import { THEMES } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Icon from "./Icon.svelte";

  // Each card is a small window drawn in its own theme: its data-theme and .theme-scope give it that
  // theme's tokens, whatever the app around it uses. Picking one applies it at once.
  let { onpick }: { onpick?: (theme: Theme) => void } = $props();
  const current = $derived(prefs.value?.theme ?? "dynamic");

  async function pick(theme: Theme) {
    if (await prefs.update({ theme, themeChosen: true })) onpick?.(theme);
  }
</script>

<div class="themes" role="radiogroup" aria-label="Theme">
  {#each THEMES as id (id)}
    {@const info = THEME_INFO[id]}
    <button role="radio" aria-checked={current === id} class="card" class:on={current === id} onclick={() => pick(id)}>
      <span class="preview theme-scope" data-theme={id} aria-hidden="true">
        <span class="side">
          <i></i><i></i><i></i>
        </span>
        <span class="stage">
          <span class="art"></span>
          <span class="lines"><i></i><i class="short"></i></span>
          <span class="pill"></span>
        </span>
        <span class="bar"><i></i></span>
      </span>
      <span class="name">
        {t(info.label)}
        {#if current === id}<span class="tick"><Icon name="check" size={13} /></span>{/if}
      </span>
      <span class="hint">{t(info.hint)}</span>
    </button>
  {/each}
</div>

<style>
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--sp-3);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    border-radius: var(--r-lg);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .card:hover {
    background: var(--glass-hover);
    transform: translateY(-2px);
  }

  .preview {
    position: relative;
    display: grid;
    grid-template-columns: 26% 1fr;
    grid-template-rows: 1fr 16%;
    gap: 4px;
    aspect-ratio: 16 / 10;
    margin-bottom: var(--sp-2);
    padding: 5px;
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--chrome-bg);
    color: var(--text);
    box-shadow:
      0 0 0 1px rgb(var(--tint) / 0.1),
      0 10px 24px -12px rgb(0 0 0 / 0.7);
    transition: box-shadow var(--dur-fast);
  }

  /* Dynamic: the chrome lit by a song's colours. */
  .preview[data-theme="dynamic"] {
    background:
      radial-gradient(70% 90% at 10% 0%, #6b2f9c, transparent 70%),
      radial-gradient(70% 90% at 100% 100%, #1f6b46, transparent 70%),
      #1a1220;
  }

  .on .preview {
    box-shadow:
      0 0 0 2px var(--accent),
      0 12px 28px -12px rgb(0 0 0 / 0.75);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
  }

  .side i,
  .lines i,
  .bar i {
    display: block;
    height: 3px;
    border-radius: 2px;
    background: rgb(var(--tint) / 0.35);
  }

  .side i:nth-child(2) {
    width: 70%;
  }

  .side i:nth-child(3) {
    width: 85%;
  }

  .stage {
    display: grid;
    grid-template-columns: 34% 1fr;
    align-content: start;
    gap: 5px;
    padding: 6px;
    border-radius: 4px;
    background: var(--stage);
    box-shadow: inset 0 0 0 1px var(--stage-edge);
  }

  .art {
    aspect-ratio: 1;
    border-radius: 3px;
    background: linear-gradient(135deg, #f0a35e, #b9406b);
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 3px;
  }

  .lines i {
    background: var(--text);
    opacity: 0.85;
  }

  .lines .short {
    width: 60%;
    background: var(--text-muted);
  }

  .pill {
    grid-column: 1 / -1;
    width: 34%;
    height: 7px;
    border-radius: var(--r-pill);
    background: var(--accent);
  }

  .bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    padding: 0 18%;
  }

  .bar i {
    flex: 1;
    background: rgb(var(--tint) / 0.5);
  }

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 2px;
    font-size: var(--fs-small);
    font-weight: 700;
  }

  .tick {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .hint {
    padding: 0 2px;
    color: var(--text-faint);
    font-size: var(--fs-caption);
    line-height: 1.35;
  }
</style>
