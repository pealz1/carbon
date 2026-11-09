<script lang="ts">
  import type { Pager } from "$lib/pager.svelte";
  import Status from "./Status.svelte";

  // Loads the next page as this sentinel nears the bottom of the scroll area.
  let { pager }: { pager: Pager<unknown> } = $props();
  let sentinel = $state<HTMLElement>();

  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && pager.more(),
      { root: sentinel.closest("main"), rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

{#if !pager.done || pager.error}
  <div bind:this={sentinel}>
    <Status loading={pager.loading} error={pager.error} onretry={() => pager.more()} />
  </div>
{/if}
