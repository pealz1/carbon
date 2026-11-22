<script lang="ts">
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { activeLocale, languages, selectLocale, t, type Locale } from "$lib/i18n/locale.svelte";
  import { ACCENTS, type Effects, type Settings } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import { services, type Services } from "$lib/services.svelte";
  import { view } from "$lib/view.svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import ThemePicker from "./ThemePicker.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Toggle from "./Toggle.svelte";
  import Wordmark from "./Wordmark.svelte";

  // First run, one flow: welcome, the look, how it moves, where the music comes from, a few
  // switches, then into the app at the place the listener picks. Every choice applies at once
  // and all of it is in Settings later. Brief is for people updating from before themes: the
  // theme picker once, as a dialog.
  let { brief = false }: { brief?: boolean } = $props();

  const STEPS = ["Welcome", "Look", "Motion", "Music", "Extras", "Ready"] as const;
  const FEELS: { id: Effects; label: string; hint: string; icon: IconName }[] = [
    { id: "full", label: "Full", hint: "Moving colour, grain and glass", icon: "spark" },
    { id: "balanced", label: "Balanced", hint: "The same look, standing still", icon: "screen" },
    { id: "minimal", label: "Minimal", hint: "Flat and fast, for older PCs", icon: "speed" },
  ];
  const SOURCES: { id: keyof Services; label: string; hint: string }[] = [
    { id: "spotify", label: "Spotify", hint: "Premium, plus a free Spotify app you create" },
    { id: "youtube", label: "YouTube Music", hint: "No account needed" },
  ];
  const EXTRAS: { key: keyof Settings; label: string }[] = [
    { key: "closeToTray", label: "Keep playing when closed" },
    { key: "autoUpdate", label: "Install updates automatically" },
    { key: "trackNotifications", label: "Song notifications" },
    { key: "discordPresence", label: "Discord status" },
    { key: "uiSounds", label: "Interface sounds" },
  ];
  const STARTS: { href: string; label: string; hint: string; icon: IconName }[] = [
    { href: "", label: "Start listening", hint: "Home", icon: "home" },
    { href: "/search", label: "Find a song", hint: "Search every source", icon: "search" },
    { href: "/local", label: "Add your music", hint: "Play files on this PC", icon: "folder" },
  ];

  let step = $state(0);
  /** 1 forwards, -1 back: which way the step slides. */
  let way = $state(1);
  let saving = $state(false);
  let picked = $state<Services>({ spotify: false, youtube: false });
  const effects = $derived(prefs.value?.effects ?? "full");
  const accent = $derived(prefs.value?.accent ?? "yellow");
  const last = STEPS.length - 1;

  function go(to: number) {
    if (to < 0 || to > last || to === step) return;
    way = to > step ? 1 : -1;
    step = to;
  }

  async function finish(href = "") {
    if (saving) return;
    saving = true;
    try {
      await prefs.update({ themeChosen: true });
      if (!brief && (await services.choose(picked)) && href) await goto(href);
    } finally {
      saving = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (brief || (event.target as HTMLElement).closest("select, input, textarea")) return;
    if (event.key === "Enter" && step < last) go(step + 1);
    else if (event.key === "Escape" || event.key === "Backspace") go(step - 1);
    else return;
    event.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

{#if brief}
  <Modal title="Themes" wide onclose={() => finish()}>
    <ThemePicker />
    <div class="foot">
      <button class="pill accent" onclick={() => finish()} disabled={saving}>Done</button>
    </div>
  </Modal>
{:else}
  <div class="onboarding">
    <TitleBar controls={false} />
    <section class="body">
      <ol class="steps" aria-label="Setup">
        {#each STEPS as name, i (name)}
          <li class:on={i === step} class:done={i < step}>
            <button onclick={() => go(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}>{t(name)}</button>
          </li>
        {/each}
      </ol>

      {#key step}
        <div class="step" in:fly={{ x: 56 * way, duration: 420, delay: 140 }} out:fly={{ x: -56 * way, duration: 180 }}>
          {#if step === 0}
            <div class="welcome">
              <div class="mark"><Wordmark height={96} /><span class="sr-only">carbon</span></div>
              <h1>Your music, one place</h1>
              <label class="language">
                <span>Language</span>
                <select class="input" value={activeLocale()} onchange={(e) => selectLocale(e.currentTarget.value as Locale)}>
                  {#each Object.entries(languages) as [code, name] (code)}<option value={code}>{name}</option>{/each}
                </select>
              </label>
            </div>
          {:else if step === 1}
            <h1>Pick a look</h1>
            <ThemePicker mark={false} />
            <div class="accents" role="radiogroup" aria-label="Accent">
              {#each ACCENTS as name (name)}
                <button class="swatch" class:on={accent === name} role="radio" aria-checked={accent === name} aria-label={name} data-swatch={name} onclick={() => prefs.update({ accent: name })}></button>
              {/each}
            </div>
          {:else if step === 2}
            <h1>How it moves</h1>
            <div class="cards three" role="radiogroup" aria-label="Effects">
              {#each FEELS as feel, i (feel.id)}
                <button role="radio" aria-checked={effects === feel.id} class="card" class:on={effects === feel.id} style="--i: {i}" onclick={() => prefs.update({ effects: feel.id })}>
                  <span class="icon"><Icon name={feel.icon} size={20} /></span>
                  <span class="name">{t(feel.label)}</span>
                  <span class="hint">{t(feel.hint)}</span>
                  <span class="tick"><Icon name="check" size={13} /></span>
                </button>
              {/each}
            </div>
          {:else if step === 3}
            <h1>Where's your music?</h1>
            <div class="cards two" role="group" aria-label="Music services">
              {#each SOURCES as source, i (source.id)}
                <button class="card" class:on={picked[source.id]} aria-pressed={picked[source.id]} style="--i: {i}" onclick={() => (picked = { ...picked, [source.id]: !picked[source.id] })}>
                  <span class="name">{source.label}</span>
                  <span class="hint">{t(source.hint)}</span>
                  <span class="tick"><Icon name="check" size={13} /></span>
                </button>
              {/each}
            </div>
            <p class="note">{picked.spotify || picked.youtube ? "Radio, local files and free sources come too" : "Pick none for radio, local files and free sources"}</p>
          {:else if step === 4}
            <h1>A few switches</h1>
            <div class="switches">
              <Toggle checked={view.lyrics} label="Lyrics beside the page" onchange={() => view.toggleLyrics()} />
              {#each EXTRAS as extra (extra.key)}
                <Toggle checked={prefs.value?.[extra.key] === true} label={t(extra.label)} onchange={(v) => prefs.update({ [extra.key]: v })} />
              {/each}
            </div>
            <p class="note">All of this is in Settings later</p>
          {:else}
            <h1>You're set</h1>
            <div class="cards three">
              {#each STARTS as start, i (start.label)}
                <button class="card go" style="--i: {i}" disabled={saving} onclick={() => finish(start.href)}>
                  <span class="icon"><Icon name={start.icon} size={20} /></span>
                  <span class="name">{t(start.label)}</span>
                  <span class="hint">{t(start.hint)}</span>
                  <span class="arrow"><Icon name="forward" size={16} /></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/key}

      <footer>
        {#if step > 0}<button class="pill ghost" onclick={() => go(step - 1)}>Back</button>{/if}
        <span class="grow"></span>
        {#if step < last}
          <button class="pill accent next" onclick={() => go(step + 1)}>
            {step === 0 ? "Get started" : "Continue"}
            <span class="chev"><Icon name="forward" size={15} /></span>
          </button>
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
    width: min(880px, calc(100% - 2 * var(--sp-6)));
    margin: 0 auto;
    padding: var(--sp-4) 0 var(--sp-6);
    overflow: hidden;
  }

  /* Progress: each step named; the line under it fills as the flow moves on. */
  .steps {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .steps li {
    position: relative;
    padding-bottom: var(--sp-2);
  }

  .steps li::before,
  .steps li::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 3px;
    border-radius: var(--r-pill);
    background: rgb(var(--tint) / 0.14);
  }

  .steps li::after {
    background: var(--accent);
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 520ms var(--ease-out);
  }

  .steps li.done::after,
  .steps li.on::after {
    transform: scaleX(1);
  }

  .steps button {
    color: var(--chrome-text-muted);
    font-size: var(--fs-caption);
    font-weight: 650;
    transition:
      color var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  .steps .on button,
  .steps .done button:hover {
    color: var(--chrome-text);
  }

  .steps button:disabled {
    cursor: default;
  }

  .step {
    grid-row: 2;
    grid-column: 1;
    align-self: center;
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    padding: var(--sp-2);
  }

  h1 {
    margin-bottom: var(--sp-5);
    font-size: var(--fs-title);
    font-weight: 800;
    animation: rise 520ms var(--ease-out) 160ms backwards;
  }

  .welcome {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
  }

  .welcome h1 {
    margin: 0;
  }

  .mark {
    animation: mark-in 900ms var(--ease-out) backwards;
  }

  .language {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--chrome-text-muted);
    font-weight: 600;
    animation: rise 520ms var(--ease-out) 320ms backwards;
  }

  .accents {
    display: flex;
    gap: var(--sp-3);
    margin-top: var(--sp-5);
  }

  .swatch {
    width: 30px;
    height: 30px;
    border-radius: var(--r-pill);
    background: var(--swatch);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3);
    transition:
      scale var(--dur-spring) var(--ease-spring),
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
  }

  .swatch:hover {
    scale: 1.15;
  }

  .swatch.on {
    scale: 1.2;
    box-shadow:
      0 0 0 2px var(--chrome-bg),
      0 0 0 4px var(--swatch);
  }

  .cards {
    display: grid;
    gap: var(--sp-3);
  }

  .cards.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cards.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: 640px;
  }

  /* A choice: lifts under the pointer, and when chosen takes the accent ring while its tick pops in. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-height: 132px;
    padding: var(--sp-4);
    border-radius: var(--r-xl);
    background: var(--plate);
    box-shadow: var(--rim);
    text-align: left;
    animation: rise 480ms var(--ease-out) backwards;
    animation-delay: calc(220ms + var(--i) * 70ms);
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .card:hover:not(:disabled) {
    background: var(--glass-hover);
    box-shadow: var(--rim-hover);
    translate: 0 -3px;
  }

  .card.on {
    background: var(--glass-active);
    box-shadow:
      var(--rim),
      0 0 0 2px var(--accent);
  }

  .card .icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    margin-bottom: auto;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    transition:
      background var(--dur-med),
      color var(--dur-med);
  }

  .card.on .icon {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .card .name {
    margin-top: auto;
    font-size: var(--fs-lead);
    font-weight: 750;
  }

  .card .hint {
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.4;
  }

  .tick,
  .arrow {
    position: absolute;
    top: var(--sp-3);
    right: var(--sp-3);
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
  }

  .tick {
    background: var(--accent);
    color: var(--accent-ink);
    scale: 0;
    transition: scale var(--dur-spring) var(--ease-spring);
  }

  .card.on .tick {
    scale: 1;
  }

  .arrow {
    color: var(--text-faint);
    transition:
      translate var(--dur-spring) var(--ease-spring),
      color var(--dur-fast);
  }

  .go:hover .arrow {
    translate: 4px 0;
    color: var(--accent);
  }

  .switches {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-2) var(--sp-6);
    max-width: 720px;
    animation: rise 480ms var(--ease-out) 220ms backwards;
  }

  .note {
    margin: var(--sp-4) 0 0;
    color: var(--chrome-text-muted);
    font-size: var(--fs-small);
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

  .next {
    height: 42px;
    padding: 0 var(--sp-4) 0 var(--sp-5);
    font-size: var(--fs-lead);
  }

  /* The arrow leans toward where it leads. */
  .chev {
    display: grid;
    transition: translate var(--dur-spring) var(--ease-spring);
  }

  .next:hover .chev {
    translate: 4px 0;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
  }

  @keyframes mark-in {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.92);
    }
  }

  @media (max-width: 760px) {
    .cards.three,
    .cards.two,
    .switches {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
