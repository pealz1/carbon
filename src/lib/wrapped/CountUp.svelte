<script lang="ts">
  import { countUp } from "./count-up";
  import { useStory } from "./story";

  // A number that counts up as its slide plays (and stands still when the story does). The final
  // figure is in the box from the first frame, unseen, so the box never changes width.
  let { to, delay = 300, duration = 1500 }: { to: number; delay?: number; duration?: number } = $props();

  const story = useStory();
  const shown = $derived(story.calm ? to : countUp(to, story.elapsed - delay, duration));
</script>

<span class="count tabular"><span class="final">{to.toLocaleString()}</span><span aria-hidden="true">{shown.toLocaleString()}</span></span>

<style>
  .count {
    display: inline-grid;
  }

  .count > span {
    grid-area: 1 / 1;
  }

  /* Read by a screen reader in place of the climbing number. */
  .final {
    opacity: 0;
  }
</style>
