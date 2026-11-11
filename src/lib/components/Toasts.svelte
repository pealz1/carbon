<script lang="ts">
  import { relaunch } from "@tauri-apps/plugin-process";
  import { fly } from "svelte/transition";
  import { player } from "$lib/player.svelte";
  import { session } from "$lib/session.svelte";
  import { toasts } from "$lib/toast.svelte";

  async function restart() {
    try {
      await relaunch();
    } catch (e) {
      console.error("[toasts] relaunch failed", e);
      toasts.error("Couldn't restart Carbon. Close it from the tray and open it again.");
    }
  }
</script>

<div class="toasts" role="status" aria-live="polite">
  {#if player.problem}
    <p class="toast glass error">
      <span>{player.error}</span>
      {#if player.problem.fix === "start-playback"}
        <button class="act" onclick={() => player.startPlayback()}>Start playback</button>
      {:else if player.problem.fix === "restart"}
        <button class="act" onclick={restart}>Restart Carbon</button>
      {:else if player.problem.fix === "sign-in"}
        <button class="act" onclick={() => session.reconsent()}>Sign in again</button>
      {/if}
    </p>
  {/if}
  {#each toasts.items as toast (toast.id)}
    <p class="toast glass" class:error={toast.kind === "error"} transition:fly={{ y: 8, duration: 200 }}>
      {toast.text}
      <button onclick={() => toasts.dismiss(toast.id)} aria-label="Dismiss">×</button>
    </p>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    left: 50%;
    bottom: calc(var(--dock-h) + var(--sp-5));
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-pill);
    font-size: var(--fs-small);
    white-space: nowrap;
    pointer-events: auto;
  }

  /* Problems explain what happened and what to do, so they wrap instead of running off screen. */
  .error {
    width: max-content;
    max-width: min(620px, calc(100vw - var(--sidebar-w) - var(--sp-6)));
    border-radius: var(--r-md);
    color: var(--warning);
    white-space: normal;
    line-height: 1.45;
    text-wrap: pretty;
  }

  button {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
  }

  button:hover {
    color: var(--text);
  }

  .act {
    flex-shrink: 0;
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-size: var(--fs-small);
    font-weight: 600;
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .act:hover {
    color: var(--accent-ink);
    transform: scale(1.04);
  }

  .act:active {
    transform: scale(0.97);
  }

  .act:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .act {
      transition: none;
    }
  }
</style>
