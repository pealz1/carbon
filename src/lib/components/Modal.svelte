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
<dialog bind:this={dialog} class="modal liquid" class:wide aria-labelledby={titleId} oncancel={cancel} onclick={(e) => e.target === dialog && onclose()}>
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
    padding: var(--sp-5);
    border-radius: var(--r-lg);
    color: var(--text);
    --glass: var(--glass-strong);
    --glass-blur: var(--glass-blur-heavy);
    overflow-y: auto;
    animation: rise var(--dur-med) var(--ease-out);
  }

  .wide {
    width: min(760px, calc(100vw - 2 * var(--sp-5)));
  }

  .modal::backdrop {
    background: rgb(4 5 8 / 0.55);
    backdrop-filter: blur(6px);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-4);
  }

  h2 {
    font-size: var(--fs-section);
  }

  .close {
    padding: var(--sp-1);
    border-radius: var(--r-sm);
    color: var(--text-muted);
  }

  .close:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }
</style>
