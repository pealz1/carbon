<script lang="ts">
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import type { TrackSort } from "$lib/track-tools";
  import Icon from "./Icon.svelte";

  // Filter, sort and order above a song list. The page owns the values and arranges its rows.
  let {
    query = $bindable(""),
    sort = $bindable<TrackSort>("default"),
    descending = $bindable(false),
    defaultLabel = "Album order",
    album = false,
    count,
  }: {
    query?: string;
    sort?: TrackSort;
    descending?: boolean;
    /** What the original order is called here ("Album order", "Playlist order", "Date added"). */
    defaultLabel?: string;
    /** Offer sorting by album (playlists mix albums; an album's songs share one). */
    album?: boolean;
    /** How many rows are showing, for the filter's live count. */
    count: number;
  } = $props();

  const SORTS = $derived<{ id: TrackSort; label: string }[]>([
    { id: "default", label: t(defaultLabel) },
    { id: "title", label: t("Title") },
    { id: "artist", label: t("Artist") },
    ...(album ? [{ id: "album" as const, label: t("Album") }] : []),
    { id: "duration", label: t("Length") },
  ]);
  const current = $derived(SORTS.find((s) => s.id === sort)?.label ?? t(defaultLabel));

  function pickSort(event: MouseEvent) {
    const items: MenuEntry[] = SORTS.map((s) => ({ label: s.label, icon: s.id === sort ? "check" : undefined, action: () => (sort = s.id) }));
    menu.open(event, items);
  }

  function pickOrder(event: MouseEvent) {
    menu.open(event, [
      { label: t("Ascending"), icon: descending ? undefined : "check", action: () => (descending = false) },
      { label: t("Descending"), icon: descending ? "check" : undefined, action: () => (descending = true) },
    ]);
  }
</script>

<div class="tools" role="toolbar" aria-label="Filter and sort">
  <label class="find" class:filled={!!query}>
    <Icon name="search" size={15} />
    <input type="search" placeholder="Filter" bind:value={query} aria-label="Filter songs" spellcheck="false" />
    {#if query}
      <span class="count tabular" aria-live="polite">{count}</span>
      <button class="clear" onclick={() => (query = "")} aria-label="Clear filter"><Icon name="close" size={13} /></button>
    {/if}
  </label>
  <span class="spacer"></span>
  <button class="pick" onclick={pickSort} aria-haspopup="menu" aria-label="Sort by {current}">
    <Icon name="sort" size={15} />
    <span>{current}</span>
    <Icon name="down" size={13} />
  </button>
  <button class="pick" onclick={pickOrder} aria-haspopup="menu" aria-label={descending ? "Descending" : "Ascending"}>
    <span class="turn" class:down={descending}><Icon name="up" size={14} /></span>
    <span>{descending ? "Descending" : "Ascending"}</span>
    <Icon name="down" size={13} />
  </button>
</div>

<style>
  .tools {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
  }

  .spacer {
    flex: 1;
  }

  .find {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 260px;
    height: 34px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: var(--rim);
    color: var(--text-faint);
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-fast);
  }

  .find:focus-within,
  .find.filled {
    background: var(--glass-active);
    box-shadow: var(--rim-hover);
    color: var(--text-muted);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-small);
    outline: none;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  .count {
    color: var(--text-faint);
    font-size: var(--fs-micro);
    font-weight: 700;
  }

  .clear {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
  }

  .clear:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    background: var(--glass);
    box-shadow: var(--rim);
    color: var(--text);
    font-size: var(--fs-small);
    font-weight: 650;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-med) var(--ease-spring),
      transform var(--dur-med) var(--ease-spring);
  }

  .pick:hover {
    background: var(--glass-active);
    box-shadow: var(--rim-hover);
    translate: 0 -1px;
  }

  .pick :global(svg:last-child) {
    color: var(--text-faint);
  }

  .turn {
    display: grid;
    transition: transform var(--dur-med) var(--ease-spring);
  }

  .turn.down {
    transform: rotate(180deg);
  }
</style>
