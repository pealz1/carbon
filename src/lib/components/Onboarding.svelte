<script lang="ts">
  import { fly } from "svelte/transition";
  import { activeLocale, languages, selectLocale, type Locale } from "$lib/i18n/locale.svelte";
  import type { Effects } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import ThemePicker from "./ThemePicker.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Wordmark from "./Wordmark.svelte";

  // First run, before the services: the look (language and theme), then how much it moves. Brief is
  // for people updating from before themes: the theme picker once, as a dialog. Either way the
  // choice is marked made, so it never shows again; Settings → Appearance changes it later.
  let { brief = false }: { brief?: boolean } = $props();

  const FEELS: { id: Effects; label: string; hint: string; icon: "spark" | "screen" | "speed" }[] = [
    { id: "full", label: "Full", hint: "Moving colour, film grain and glass everywhere", icon: "spark" },
    { id: "balanced", label: "Balanced", hint: "The same colour and glass, standing still", icon: "screen" },
    { id: "minimal", label: "Minimal", hint: "Flat colour, no blur or motion; best on older PCs", icon: "speed" },
  ];
  const STEPS = 2;
  let step = $state(0);
  let saving = $state(false);
  const effects = $derived(prefs.value?.effects ?? "full");

  async function finish() {
    if (saving) return;
    saving = true;
    await prefs.update({ themeChosen: true });
    saving = false;
  }
</script>

{#if brief}
  <Modal title="New: themes" wide onclose={finish}>
    <p class="lede small">Carbon now comes in seven looks, OLED black and Light among them. Pick one; Settings → Appearance changes it any time.</p>
    <ThemePicker />
    <div class="foot">
      <button class="pill" onclick={finish} disabled={saving}>Done</button>
    </div>
  </Modal>
{:else}
  <div class="onboarding">
    <TitleBar controls={false} />
    <section class="body">
      <header>
        <Wordmark height={44} />
        <ol class="dots" aria-label="Step {step + 1} of {STEPS}">
          {#each { length: STEPS } as _, i (i)}<li class:on={i === step} class:done={i < step}></li>{/each}
        </ol>
      </header>

      {#key step}
        <div class="step" in:fly={{ x: 40, duration: 380, delay: 120 }} out:fly={{ x: -40, duration: 200 }}>
          {#if step === 0}
            <h1>Make it yours</h1>
            <p class="lede">Choose a language and a look. Dynamic paints Carbon in the colours of what's playing.</p>
            <label class="language">
              <Icon name="tag" size={16} />
              <span>Language</span>
              <select class="input" value={activeLocale()} onchange={(e) => selectLocale(e.currentTarget.value as Locale)}>
                {#each Object.entries(languages) as [code, name] (code)}<option value={code}>{name}</option>{/each}
              </select>
            </label>
            <ThemePicker />
          {:else}
            <h1>How it moves</h1>
            <p class="lede">Carbon is full of light and motion. Turn it down on older PCs or if you'd rather it kept still.</p>
            <div class="feels" role="radiogroup" aria-label="Effects">
              {#each FEELS as feel (feel.id)}
                <button role="radio" aria-checked={effects === feel.id} class="feel plate" class:on={effects === feel.id} onclick={() => prefs.update({ effects: feel.id })}>
                  <span class="icon"><Icon name={feel.icon} size={20} /></span>
                  <span class="name">{feel.label}</span>
                  <span class="hint">{feel.hint}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/key}

      <footer>
        {#if step > 0}<button class="pill ghost" onclick={() => step--}>Back</button>{/if}
        <span class="grow"></span>
        {#if step < STEPS - 1}
          <button class="pill" onclick={() => step++}>Continue</button>
        {:else}
          <button class="pill" onclick={finish} disabled={saving}>{saving ? "Saving…" : "Continue"}</button>
        {/if}
      </footer>
    </section>
  </div>
{/if}

<style>
  .onboarding {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr;
    color: var(--chrome-text);
  }

  .body {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--sp-5);
    width: min(860px, calc(100% - 2 * var(--sp-6)));
    margin: 0 auto;
    padding: var(--sp-5) 0 var(--sp-6);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dots {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dots li {
    width: 8px;
    height: 8px;
    border-radius: var(--r-pill);
    background: rgb(var(--tint) / 0.2);
    transition:
      background var(--dur-med),
      transform var(--dur-med) var(--ease-spring);
  }

  .dots li.done {
    background: rgb(var(--tint) / 0.5);
  }

  .dots li.on {
    background: var(--accent);
    transform: scale(1.35);
  }

  .step {
    grid-row: 2;
    grid-column: 1;
    align-self: start;
    min-height: 0;
    overflow-y: auto;
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 800;
  }

  .lede {
    max-width: 56ch;
    margin: var(--sp-2) 0 var(--sp-5);
    color: var(--chrome-text-muted);
    font-size: var(--fs-lead);
    line-height: 1.5;
  }

  .lede.small {
    margin-top: 0;
    font-size: var(--fs-body);
    color: var(--text-muted);
  }

  .language {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: var(--sp-4);
    color: var(--chrome-text-muted);
    font-weight: 600;
  }

  .language select {
    margin-left: var(--sp-1);
  }

  .feels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-3);
  }

  .feel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    text-align: left;
    transition:
      box-shadow var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .feel:hover {
    transform: translateY(-2px);
  }

  .feel.on {
    box-shadow: 0 0 0 2px var(--accent);
  }

  .feel .icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--glass-active);
  }

  .feel.on .icon {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .feel .name {
    font-weight: 750;
  }

  .feel .hint {
    color: var(--text-faint);
    font-size: var(--fs-small);
    line-height: 1.4;
  }

  footer,
  .foot {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .foot {
    justify-content: flex-end;
    margin-top: var(--sp-4);
  }

  .grow {
    flex: 1;
  }
</style>
