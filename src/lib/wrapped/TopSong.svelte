<script lang="ts">
  import type { Top } from "$lib/history/wrapped";
  import Art from "./Art.svelte";
  import Plays from "./Plays.svelte";

  // The most played song: its cover, large, beside its name.
  let { song }: { song: Top } = $props();
</script>

<section class="top-song">
  <figure class="cover"><Art image={song.image} /></figure>
  <div class="text">
    <h2 class="lead-in rise" style:--i={1}>The song you played most</h2>
    <p class="name rise" style:--i={2}>{song.title}</p>
    {#if song.subtitle}<p class="sub rise" style:--i={3}>{song.subtitle}</p>{/if}
    <p class="plays rise" style:--i={4}><Plays count={song.plays} counting /></p>
  </div>
</section>

<style>
  .top-song {
    display: grid;
    grid-template-columns: var(--art) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-7);
  }

  /* The cover arrives as one piece and then holds still. */
  .cover {
    animation: arrive var(--dur-slow) var(--ease-out) backwards;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }

  .plays {
    margin-top: var(--sp-3);
    color: var(--tone);
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 800;
    letter-spacing: var(--tracking-tight);
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }
</style>
