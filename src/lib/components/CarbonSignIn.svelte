<script lang="ts">
  import { account } from "$lib/account.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Wordmark from "./Wordmark.svelte";

  const waiting = $derived(account.status === "signing-in");
</script>

<div class="signin">
  <TitleBar controls={false} />
  <section class="hero">
    <h1><Wordmark height={120} /><span class="sr-only">carbon</span></h1>
    <p class="lede">Step one: sign in to your Carbon account, or create one, in your browser. Then connect Spotify and start listening.</p>
    <div class="cta">
      <button onclick={() => account.signIn()} disabled={waiting}>{waiting ? "Waiting for your browser…" : "Sign in to Carbon"}</button>
      {#if waiting}
        <p class="hint">Finish signing in on the getcarbon.cc page that just opened, then come back here.</p>
      {/if}
    </div>
    {#if account.error}
      <p class="error" role="alert">{account.error}</p>
    {/if}
  </section>
</div>

<style>
  .signin {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr;
  }

  .hero {
    align-self: end;
    padding: 0 var(--sp-7) var(--sp-7);
    max-width: 760px;
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
    max-width: 38ch;
    margin: 0 0 var(--sp-5);
    font-size: 1.05rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  button {
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

  button:hover:not(:disabled) {
    background: var(--accent-strong);
  }

  button:disabled {
    opacity: 0.7;
    cursor: progress;
  }

  .hint,
  .error {
    margin: var(--sp-3) 0 0;
    font-size: var(--fs-small);
  }

  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--warning);
  }
</style>
