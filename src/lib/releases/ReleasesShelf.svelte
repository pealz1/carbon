<script lang="ts">
  import { onMount } from "svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import { recent, releaseCard } from "./releases";
  import { newReleases } from "./store.svelte";

  // Home's "New releases" shelf: the last few weeks from artists you follow, with a link to all of it.
  const WEEKS = 4;
  const SHELF_MAX = 20;
  const cards = $derived(recent(newReleases.cache, WEEKS, Date.now()).slice(0, SHELF_MAX).map(releaseCard));

  onMount(() => void newReleases.ensure());
</script>

<Shelf title="New releases" {cards}>
  {#snippet action()}<a class="all" href="/releases">Show all</a>{/snippet}
</Shelf>

<style>
  .all {
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .all:hover {
    color: var(--text);
  }
</style>
