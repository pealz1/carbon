<script lang="ts">
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { greeting } from "$lib/format";
  import { resource } from "$lib/resource.svelte";
  import * as api from "$lib/youtube/api";
  import type { Shelf as ShelfData } from "$lib/youtube/mappers";
  import { youtube } from "$lib/youtube/session.svelte";

  // YouTube Music's home shelves, laid out like Carbon's Spotify home. The first page is thin (two
  // or three shelves), so a couple more load right after it.
  const EXTRA_PAGES = 2;

  const first = resource(() => {
    void youtube.signedIn; // signing in personalises home
    return api.home();
  });
  let extra = $state<ShelfData[]>([]);

  $effect(() => {
    const page = first.data;
    extra = [];
    if (!page?.continuation) return;
    let current = true;
    void (async () => {
      let token: string | null = page.continuation;
      for (let i = 0; i < EXTRA_PAGES && token && current; i++) {
        const more = await api.homeMore(token);
        if (!current) return;
        extra = [...extra, ...more.shelves];
        token = more.continuation;
      }
    })().catch((e) => console.warn("[youtube] more home shelves failed", e));
    return () => (current = false);
  });

  const shelves = $derived([...(first.data?.shelves ?? []), ...extra]);
  const firstName = $derived(youtube.account?.name.split(" ")[0] ?? "");
</script>

<header class="hero">
  <h1>{greeting(new Date())}{firstName ? `, ${firstName}` : ""}</h1>
</header>

{#if first.loading && !first.data}
  <Status loading />
{:else if first.error}
  <Status error={first.error} onretry={first.reload} />
{:else if !shelves.length}
  <Status empty="YouTube Music has nothing to suggest yet. Try searching." />
{/if}

{#each shelves as shelf, i (shelf.title + i)}
  <Shelf title={shelf.title} cards={shelf.cards} feature={i === 0} />
{/each}

<style>
  .hero {
    padding: var(--sp-6) 0 var(--sp-5);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 800;
    line-height: 1.05;
  }
</style>
