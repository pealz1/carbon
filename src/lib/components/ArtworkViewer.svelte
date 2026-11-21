<script lang="ts">
  import Icon from "./Icon.svelte";

  // The artwork at full size over a dark scrim. A native <dialog>: Esc, focus trap and the top layer
  // for free; a click anywhere closes it. The image is shown whole and untouched.
  let { src, title, subtitle, onclose }: { src: string; title: string; subtitle?: string; onclose: () => void } = $props();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => opener?.focus?.();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="viewer keep-dark"
  aria-label="Artwork for {title}"
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclick={onclose}
>
  <figure>
    <img {src} alt="Artwork for {title}" width="640" height="640" />
    <figcaption>
      <span class="title">{title}</span>
      {#if subtitle}<span class="sub">{subtitle}</span>{/if}
    </figcaption>
  </figure>
  <button class="close" onclick={onclose} aria-label="Close"><Icon name="close" size={18} /></button>
</dialog>

<style>
  .viewer {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--text);
    cursor: zoom-out;
  }

  .viewer::backdrop {
    background: rgb(0 0 0 / 0.78);
    backdrop-filter: blur(18px) saturate(1.2);
    animation: fade-in var(--dur-med) var(--ease-out);
  }

  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    margin: 0;
    animation: zoom-in 420ms var(--ease-spring);
  }

  img {
    width: min(640px, 78vmin);
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-lg);
    object-fit: cover;
    box-shadow:
      0 0 0 1px rgb(255 255 255 / 0.08),
      0 40px 90px -20px rgb(0 0 0 / 0.95);
  }

  figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }

  .title {
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .close {
    position: fixed;
    top: var(--sp-4);
    right: var(--sp-4);
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.1);
    color: var(--text);
    cursor: pointer;
  }

  .close:hover {
    background: rgb(255 255 255 / 0.18);
  }

  @keyframes zoom-in {
    from {
      opacity: 0;
      transform: scale(0.86) translateY(16px);
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
</style>
