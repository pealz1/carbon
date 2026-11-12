<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Status from "$lib/components/Status.svelte";
  import { byWeek, MAX_ARTISTS, recent, releaseCard } from "$lib/releases/releases";
  import { newReleases as store } from "$lib/releases/store.svelte";

  // Albums and singles from the artists you follow, from the last few weeks, newest first.
  const SPANS = [4, 8, 12] as const;
  const weeks = $derived(SPANS.find((w) => String(w) === page.url.searchParams.get("weeks")) ?? 8);
  const groups = $derived(byWeek(recent(store.cache, weeks, Date.now()), Date.now()));

  onMount(() => void store.ensure());

  function status(): string {
    if (store.checking) return `Checking artists… ${store.checking.done} of ${store.checking.total}`;
    const count = store.artistCount;
    if (!count) return "";
    const capped = count >= MAX_ARTISTS ? ` (Carbon checks the first ${MAX_ARTISTS})` : "";
    const hours = store.updatedMs ? Math.round((Date.now() - store.updatedMs) / 3_600_000) : null;
    const age = hours === null ? "" : hours < 1 ? " · Up to date" : ` · Checked ${hours} h ago`;
    return `From ${count} ${count === 1 ? "artist" : "artists"} you follow${capped}${age}`;
  }
</script>

<header class="page-head">
  <div class="title">
    <h1>New releases</h1>
    <p class="status" aria-live="polite">{status()}</p>
  </div>
  <div class="tools">
    <div class="segmented" role="radiogroup" aria-label="How far back">
      {#each SPANS as w (w)}
        <button role="radio" aria-checked={weeks === w} class:active={weeks === w} onclick={() => goto(`?weeks=${w}`, { replaceState: true, noScroll: true, keepFocus: true })}>
          {w} weeks
        </button>
      {/each}
    </div>
    <button class="pill" onclick={() => store.ensure(true)} disabled={!!store.checking}><Icon name="refresh" size={15} />Check again</button>
  </div>
</header>

{#if store.error}<Status error={store.error} onretry={() => store.ensure()} />{/if}

{#each groups as group (group.label)}
  <section class="week">
    <h2>{group.label}</h2>
    <div class="grid">
      {#each group.releases as r (r.id)}
        <MediaCard card={releaseCard(r)} />
      {/each}
    </div>
  </section>
{:else}
  {#if !store.loaded || store.checking}
    <Status loading />
  {:else if !store.error}
    <Status empty={store.artistCount ? `Nothing new in the last ${weeks} weeks.` : "Follow artists on Spotify and their new albums and singles show up here."} />
  {/if}
{/each}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .status {
    margin: 0;
    min-height: 1.4em;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-left: auto;
  }

  .week {
    margin-bottom: var(--sp-5);
  }

  .week h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }
</style>
