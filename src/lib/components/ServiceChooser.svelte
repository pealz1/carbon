<script lang="ts">
  import { services, type Services } from "$lib/services.svelte";
  import Icon from "./Icon.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Wordmark from "./Wordmark.svelte";

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
  <TitleBar controls={false} />
  <section class="hero">
    <h1><Wordmark height={120} /><span class="sr-only">carbon</span></h1>
    <p class="lede">Where's your music? Pick one or both. Carbon keeps them apart, with separate libraries and queues, and you can change this in Settings.</p>
    <div class="options" role="group" aria-label="Music services">
      {#each OPTIONS as option (option.id)}
        <button class="option plate" class:on={picked[option.id]} aria-pressed={picked[option.id]} onclick={() => (picked = { ...picked, [option.id]: !picked[option.id] })}>
          <span class="check" aria-hidden="true">{#if picked[option.id]}<Icon name="check" size={14} />{/if}</span>
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

  h1 {
    display: flex;
    margin: var(--sp-4) 0 var(--sp-5);
  }

  h1 :global(svg) {
    width: auto;
    height: clamp(5rem, 11vw, 8.5rem);
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
    grid-template-columns: 24px 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    padding: var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-4);
    text-align: left;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  .option:hover {
    background: var(--glass-hover);
  }

  .option.on {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .check {
    grid-row: 1 / -1;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1.5px var(--text-faint);
    color: var(--accent-ink);
  }

  .on .check {
    background: var(--accent);
    box-shadow: none;
  }

  .name {
    font-family: var(--font-display);
    font-size: var(--fs-lead);
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
      background var(--dur-fast),
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .go:hover:not(:disabled) {
    background: var(--accent-strong);
  }

  .go:disabled {
    opacity: 0.45;
  }

  @container (max-width: 640px) {
    .options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
