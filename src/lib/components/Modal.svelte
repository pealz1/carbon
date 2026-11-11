<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  // Native <dialog>: modal focus trap, Esc to close and the top layer for free.
  let { title, onclose, children, wide = false }: { title: string; onclose: () => void; children: Snippet; wide?: boolean } = $props();
  let dialog = $state<HTMLDialogElement>();
  const titleId = `modal-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => opener?.focus?.();
  });

  function cancel(event: Event) {
    event.preventDefault();
    onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} class="modal glass" class:wide aria-labelledby={titleId} oncancel={cancel} onclick={(e) => e.target === dialog && onclose()}>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button class="close" onclick={onclose} aria-label="Close"><Icon name="close" size={16} /></button>
  </header>
  {@render children()}
</dialog>

<style>
  .modal {
    width: min(440px, calc(100vw - 2 * var(--sp-5)));
    max-height: calc(100vh - 2 * var(--sp-6));
    padding: var(--sp-4) var(--sp-5) var(--sp-5);
    border: 0;
    border-radius: var(--r-xl);
    color: var(--text);
    overflow-y: auto;
    animation: rise var(--dur-med) var(--ease-out);
  }

  .wide {
    width: min(760px, calc(100vw - 2 * var(--sp-5)));
  }

  .modal::backdrop {
    background: var(--scrim);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 calc(var(--sp-2) * -1) var(--sp-4) 0;
  }

  h2 {
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .close {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .close:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
</style>
