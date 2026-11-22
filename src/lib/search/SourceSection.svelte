<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { resource } from "$lib/resource.svelte";
  import { searchSource } from "./adapters";
  import CatalogHits from "./CatalogHits.svelte";
  import { briefOf, isEmpty, progressOf, type Progress } from "./map";
  import type { SearchSource } from "./sources";
  import StationRows from "./StationRows.svelte";

  // One source's answer to the search. `brief` (the "All" view) shows its best few, and a source
  // with nothing to show takes no room there. A source that fails says so in one line of its own.
  let {
    source,
    term,
    brief,
    matcher,
    onmore,
    onprogress,
  }: {
    source: SearchSource;
    term: string;
    brief: boolean;
    /** Where this source's catalogue hits play. */
    matcher: SearchSource;
    onmore: () => void;
    onprogress: (progress: Progress) => void;
  } = $props();

  // Re-asks when the term changes; an answer for an earlier term is dropped (resource.svelte.ts).
  const search = resource(() => searchSource(source.id, term));
  const found = $derived(search.data && !isEmpty(search.data) ? (brief ? briefOf(search.data) : search.data) : null);
  $effect(() => onprogress(progressOf(search)));
</script>

{#if !brief || found || search.error}
  <section class="source" class:stale={search.loading && !!found} style="--hue: {source.hue}" aria-busy={search.loading}>
    <header>
      <span class="mark" aria-hidden="true"><Icon name={source.icon} size={15} /></span>
      <h2>{t(source.name)}</h2>
      {#if source.plays === "match"}<span class="badge">Plays on {matcher.name}</span>{/if}
      {#if brief && found}<button class="more" onclick={onmore}>More from {t(source.name)}<Icon name="forward" size={13} /></button>{/if}
    </header>

    {#if search.error}
      <p class="quiet" role="status">{search.error}</p>
    {:else if found}
      {#if found.top && found.tracks.length}
        <div class="lead">
          <div class="best"><MediaCard card={found.top} feature /></div>
          <TrackList tracks={found.tracks} compact />
        </div>
      {:else if found.tracks.length}
        <TrackList tracks={found.tracks} compact />
      {:else if found.top}
        <div class="best"><MediaCard card={found.top} feature /></div>
      {/if}
      {#if found.hits.length}<CatalogHits hits={found.hits} {source} {matcher} />{/if}
      {#if found.stations.length}<StationRows stations={found.stations} />{/if}
      {#each found.shelves as shelf (shelf.title)}
        <Shelf title={t(shelf.title)} cards={shelf.cards} />
      {/each}
    {:else if search.loading}
      <p class="quiet" role="status">Searching…</p>
    {:else}
      <p class="quiet">No results.</p>
    {/if}
  </section>
{/if}

<style>
  .source {
    margin-bottom: var(--sp-6);
    animation: arrive var(--dur-med) var(--ease-out) backwards;
    transition: opacity var(--dur-fast);
  }

  /* Still showing the last answer while the next one is on its way. */
  .stale {
    opacity: 0.55;
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  .mark {
    width: 28px;
    height: 28px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: oklch(62% 0.15 var(--hue) / 0.22);
    color: oklch(85% 0.1 var(--hue));
  }

  :global([data-theme="light"]) .mark {
    color: oklch(42% 0.14 var(--hue));
  }

  h2 {
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .badge {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
    font-size: var(--fs-caption);
    white-space: nowrap;
  }

  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-left: auto;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    white-space: nowrap;
  }

  .more:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .more:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .more :global(svg) {
    transition: transform var(--dur-med) var(--ease-out);
  }

  .more:hover :global(svg) {
    transform: translateX(3px);
  }

  .quiet {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  /* On its own, a source leads with its best answer; the card keeps the songs company as they scroll. */
  .lead {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-5);
    margin-bottom: var(--sp-5);
  }

  .lead .best {
    position: sticky;
    top: var(--sp-4);
  }

  .best {
    max-width: 300px;
  }

  @container stage (max-width: 820px) {
    .lead {
      grid-template-columns: minmax(0, 1fr);
    }

    .lead .best {
      position: static;
    }
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
