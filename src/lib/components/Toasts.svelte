<script lang="ts">
  import { fly } from "svelte/transition";
  import { player } from "$lib/player.svelte";
  import { toasts } from "$lib/toast.svelte";
</script>

<div class="toasts" role="status" aria-live="polite">
  {#if player.error}
    <p class="toast glass error">{player.error}</p>
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

  .error {
    color: var(--warning);
  }

  button {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
  }

  button:hover {
    color: var(--text);
  }
</style>
