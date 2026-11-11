<script lang="ts">
  import { services, type Services } from "$lib/services.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import TitleBar from "./TitleBar.svelte";

  // First run, after the Carbon account: which services to connect. Either works on its own.
  const OPTIONS: { id: keyof Services; name: string; detail: string }[] = [
    { id: "spotify", name: "Spotify", detail: "Needs Spotify Premium and your own free Spotify app. Setup takes about two minutes." },
    { id: "youtube", name: "YouTube Music", detail: "Works without an account. Sign in with Google later for your library and likes." },
  ];

  let picked = $state<Services>({ spotify: false, youtube: false });
  let saving = $state(false);
  const ready = $derived(picked.spotify || picked.youtube);

  async function go() {
    if (!ready || saving) return;
    saving = true;
    await services.choose(picked);
    saving = false;
  }
</script>

<div class="chooser">
  <TitleBar showSearch={false} />
  <section class="hero">
    <div class="mark"><Logo size={72} /></div>
    <p class="eyebrow">Welcome to Carbon</p>
    <h1>Where's your music?</h1>
    <p class="lede">Pick one or both. Carbon keeps them apart: separate libraries, separate queues. You can change this in Settings.</p>
    <div class="options" role="group" aria-label="Music services">
      {#each OPTIONS as option (option.id)}
        <button class="option" class:on={picked[option.id]} aria-pressed={picked[option.id]} onclick={() => (picked = { ...picked, [option.id]: !picked[option.id] })}>
          <span class="check" aria-hidden="true">{#if picked[option.id]}<Icon name="check" size={16} />{/if}</span>
          <span class="name">{option.name}</span>
          <span class="detail">{option.detail}</span>
        </button>
      {/each}
    </div>
    <button class="go" onclick={go} disabled={!ready || saving}>{saving ? "Setting up…" : "Continue"}</button>
  </section>
</div>

<style>
  .chooser {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr;
  }

  .hero {
    align-self: end;
    padding: 0 var(--sp-7) var(--sp-7);
    max-width: 820px;
  }

  .mark {
    margin-bottom: var(--sp-5);
    filter: drop-shadow(0 0 40px var(--accent-glow));
  }

  h1 {
    font-size: clamp(3rem, 6vw, 5rem);
    font-weight: 700;
    line-height: 0.92;
    letter-spacing: -0.05em;
    margin: var(--sp-2) 0 var(--sp-4);
  }

  .lede {
    max-width: 46ch;
    margin: 0 0 var(--sp-5);
    font-size: 1.05rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .option {
    display: grid;
    grid-template-columns: 28px 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    padding: var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    box-shadow: 0 1px 0 0 var(--glass-edge-top) inset;
    text-align: left;
    transition:
      background var(--dur-fast),
      border-color var(--dur-fast),
      transform var(--dur-fast) var(--ease-spring);
  }

  .option:hover {
    background: var(--glass-hover);
  }

  .option:active {
    transform: scale(0.98);
  }

  .option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .option.on {
    border-color: var(--accent);
    background: var(--glass-active);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .check {
    grid-row: 1 / -1;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    border: 1.5px solid var(--glass-edge-top);
    color: var(--accent-ink);
  }

  .on .check {
    background: var(--accent);
    border-color: transparent;
  }

  .name {
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
  }

  .detail {
    font-size: var(--fs-small);
    line-height: 1.45;
    color: var(--text-muted);
  }

  .go {
    height: 52px;
    padding: 0 var(--sp-6);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    font-size: 1rem;
    box-shadow: 0 18px 40px -14px var(--accent-glow);
    transition:
      transform var(--dur-fast) var(--ease-spring),
      opacity var(--dur-fast);
  }

  .go:hover:not(:disabled) {
    transform: scale(1.04);
  }

  .go:disabled {
    opacity: 0.5;
  }
</style>
