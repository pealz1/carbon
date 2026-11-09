<script lang="ts">
  // Loading / error / empty placeholder shared by every view.
  let {
    loading = false,
    error = null,
    empty = null,
    onretry,
  }: { loading?: boolean; error?: string | null; empty?: string | null; onretry?: () => void } = $props();
</script>

{#if loading}
  <div class="status" aria-busy="true" aria-live="polite">
    <span class="pulse"></span><span class="pulse"></span><span class="pulse"></span>
    <span class="sr-only">Loading</span>
  </div>
{:else if error}
  <div class="status error" role="alert">
    <p>{error}</p>
    {#if onretry}<button onclick={onretry}>Try again</button>{/if}
  </div>
{:else if empty}
  <div class="status"><p>{empty}</p></div>
{/if}

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-height: 160px;
    color: var(--text-muted);
  }

  .error {
    flex-direction: column;
    color: var(--warning);
  }

  p {
    margin: 0;
    max-width: 46ch;
    text-align: center;
  }

  button {
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    color: var(--text);
    font-weight: 600;
  }

  button:hover {
    background: var(--glass-edge-top);
  }

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--text-muted);
    animation: pulse 1s var(--ease-out) infinite alternate;
  }

  .pulse:nth-child(2) {
    animation-delay: 160ms;
  }

  .pulse:nth-child(3) {
    animation-delay: 320ms;
  }

  @keyframes pulse {
    from {
      opacity: 0.25;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
