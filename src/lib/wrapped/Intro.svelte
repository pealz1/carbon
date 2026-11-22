<script lang="ts">
  // The opening slide: the year, very large, and the other years that have a story.
  let { year, years, onpick }: { year: number; years: number[]; onpick: (year: number) => void } = $props();
</script>

<section class="intro">
  <p class="year figure tabular rise">{year}</p>
  <h1 class="title rise" style:--i={1}>Your year in Carbon</h1>
  <p class="sub rise" style:--i={2}>Added up on this PC from what you've played in Carbon.</p>
  {#if years.length > 1}
    <div class="segmented rise" style:--i={3} role="group" aria-label="Year">
      {#each years as other (other)}
        <button class:active={other === year} aria-pressed={other === year} onclick={() => onpick(other)}>{other}</button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  /* The year is the poster: half as large again as any other figure in the story. */
  .year {
    margin-left: -0.04em;
    font-size: calc(var(--figure) * 1.5);
  }

  .title {
    margin-top: var(--sp-4);
  }

  .sub {
    margin-top: var(--sp-3);
  }

  .segmented {
    margin-top: var(--sp-6);
  }
</style>
