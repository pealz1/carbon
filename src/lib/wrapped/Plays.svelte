<script lang="ts">
  import CountUp from "./CountUp.svelte";

  // "87 plays", or "1 play". `counting` counts the number up as the slide plays.
  let { count, counting = false }: { count: number; counting?: boolean } = $props();
</script>

{#if count === 1}
  1 play
{:else}
  {#if counting}<CountUp to={count} />{:else}<span class="tabular">{count.toLocaleString()}</span>{/if} plays
{/if}
