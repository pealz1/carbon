<script lang="ts">
  import { relaunch } from "@tauri-apps/plugin-process";
  import { fly } from "svelte/transition";
  import { player } from "$lib/player.svelte";
  import { session } from "$lib/session.svelte";
  import { toasts } from "$lib/toast.svelte";
  import Icon from "./Icon.svelte";

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
      <button onclick={() => toasts.dismiss(toast.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
    </p>
  {/each}
</div>

<style>
  .toasts {
    position: absolute;
    left: 50%;
    bottom: var(--sp-4);
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
    min-height: 40px;
    margin: 0;
    padding: var(--sp-1) var(--sp-1) var(--sp-1) var(--sp-4);
    border-radius: var(--r-lg);
    font-size: var(--fs-small);
    font-weight: 500;
    white-space: nowrap;
    pointer-events: auto;
  }

  /* Problems explain what happened and what to do, so they wrap instead of running off screen. */
  .error {
    width: max-content;
    max-width: min(620px, 80cqw);
    color: var(--warning);
    white-space: normal;
    line-height: 1.45;
    text-wrap: pretty;
  }

  button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: var(--r-sm);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  button:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .act {
    width: auto;
    height: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
  }

  .act:hover {
    background: var(--accent-strong);
    color: var(--accent-ink);
  }
</style>
