<script lang="ts">
  // How far a long job is, in words and as a bar. Without a total the bar stays empty and the words carry it.
  let { label, done, total }: { label: string; done?: number; total?: number | null } = $props();

  const fraction = $derived(total && done !== undefined ? Math.min(1, done / total) : 0);
  const counted = $derived(done === undefined ? "" : ` ${done.toLocaleString()}${total ? ` of ${total.toLocaleString()}` : ""}`);
</script>

<div class="progress">
  <p class="tabular" aria-live="polite">{label}{counted}</p>
  <div class="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total ?? undefined} aria-valuenow={total ? done : undefined}>
    <span style="transform: scaleX({fraction})"></span>
  </div>
</div>

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .bar {
    height: 4px;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform var(--dur-med) var(--ease-out);
  }
</style>
