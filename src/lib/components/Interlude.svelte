<script lang="ts">
  // An instrumental break in synced lyrics: three dots that fill one after another over the gap and
  // breathe while it plays. `still` drops the swelling and breathing (reduced motion, Minimal effects).
  let { fills, live, still }: { fills: number[]; live: boolean; still: boolean } = $props();
</script>

<span class="interlude" class:live class:still aria-label="Instrumental break">
  {#each fills as fill, k (k)}<i style="--f: {fill}"></i>{/each}
</span>

<style>
  .interlude {
    display: inline-flex;
    gap: 10px;
    padding: var(--sp-2) 0;
    transform-origin: left center;
  }

  i {
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: var(--text);
    opacity: calc(0.28 + var(--f) * 0.72);
    transform: scale(calc(0.7 + var(--f) * 0.3));
  }

  .live:not(.still) {
    animation: breathe 2.4s var(--ease-out) infinite alternate;
  }

  .still i {
    transform: none;
  }

  /* Balanced holds still like the wallpaper; Minimal and reduced motion stop animation globally. */
  :global([data-effects="balanced"]) .live {
    animation: none;
  }

  @keyframes breathe {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.12);
    }
  }
</style>
