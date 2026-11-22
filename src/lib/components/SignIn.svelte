<script lang="ts">
  import { session } from "$lib/session.svelte";
  import ClientIdForm from "./ClientIdForm.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Wordmark from "./Wordmark.svelte";

  const waiting = $derived(session.status === "signing-in");
  const needsId = $derived(session.status === "needs-client-id");
</script>

<div class="signin">
  <TitleBar controls={false} />
  <section class="hero">
    <h1><Wordmark height={120} /><span class="sr-only">carbon</span></h1>
    {#if needsId}
      <p class="lede">Spotify limits each app to 5 listeners, so Carbon runs on your own free Spotify app. About 2 minutes, once.</p>
      <ClientIdForm />
    {:else}
      <p class="lede">Sign in with your Spotify Premium account.</p>
      <div class="cta">
        <button onclick={() => session.signIn()} disabled={waiting}>
          {waiting ? "Waiting for your browser…" : "Sign in with Spotify"}
        </button>
        {#if waiting}
          <p class="hint">Approve Carbon in your browser, then come back.</p>
        {/if}
      </div>
    {/if}
    {#if session.error}
      <p class="error" role="alert">{session.error}</p>
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
    transition: transform var(--dur-fast) var(--ease-spring), opacity var(--dur-fast);
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
    margin: 0;
    font-size: var(--fs-small);
  }

  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--warning);
  }
</style>
