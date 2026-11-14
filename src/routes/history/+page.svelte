<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Status from "$lib/components/Status.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { byDay, countOf, sourceLabel, sourcesOf } from "$lib/history/entries";
  import { history } from "$lib/history/history.svelte";
  import SongRow from "$lib/history/SongRow.svelte";
  import { byStars, starsText } from "$lib/ratings/ratings";
  import { ratings } from "$lib/ratings/ratings.svelte";

  // What was played in Carbon, newest first and grouped by day, and the songs given stars. The
  // view and the source filter live in the address, so Back returns to the same list.
  const PAGE = 200;
  const view = $derived(page.url.searchParams.get("view") === "rated" ? "rated" : "plays");
  const sources = $derived(sourcesOf(history.entries));
  const source = $derived(sources.find((s) => s === page.url.searchParams.get("source")) ?? null);
  const total = $derived(countOf(history.entries, source));
  let shown = $state(PAGE);
  const days = $derived(byDay(history.entries, Date.now(), { source, limit: shown }));
  const rated = $derived(byStars(ratings.all));
  let confirming = $state(false);

  const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const plays = (count: number) => (count === 1 ? "1 play" : `${count.toLocaleString()} plays`);
  const songs = (count: number) => (count === 1 ? "1 song" : `${count.toLocaleString()} songs`);

  onMount(() => {
    void history.load();
    void ratings.load();
  });

  function show(next: { view?: string; source?: string | null }) {
    const params = new URLSearchParams();
    if ((next.view ?? view) === "rated") params.set("view", "rated");
    const filter = next.source === undefined ? source : next.source;
    if (filter) params.set("source", filter);
    shown = PAGE;
    void goto(`?${params}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  function status(): string {
    if (view === "rated") return ratings.loaded ? `${songs(ratings.all.length)} with stars, kept on this PC.` : "";
    if (!history.loaded) return "";
    return `${plays(history.entries.length)} kept on this PC.${history.paused ? " Paused: nothing is being added." : ""}`;
  }

  async function clear() {
    if (await history.clear()) confirming = false;
  }
</script>

<header class="page-head">
  <div class="title">
    <h1>History</h1>
    <p class="status" aria-live="polite">{status()}</p>
  </div>
  <div class="segmented" role="radiogroup" aria-label="View">
    <button role="radio" aria-checked={view === "plays"} onclick={() => show({ view: "plays" })}>Plays</button>
    <button role="radio" aria-checked={view === "rated"} onclick={() => show({ view: "rated" })}>Rated</button>
  </div>
</header>

{#if view === "plays"}
  <div class="tools">
    {#if sources.length > 1}
      <div class="filter" role="group" aria-label="Played on">
        <button class="pill" class:active={!source} aria-pressed={!source} onclick={() => show({ source: null })}>Everything</button>
        {#each sources as s (s)}
          <button class="pill" class:active={source === s} aria-pressed={source === s} onclick={() => show({ source: s })}>{sourceLabel(s)}</button>
        {/each}
      </div>
    {/if}
    <div class="switches">
      <div class="pause"><Toggle checked={history.paused} label="Pause history" onchange={(on) => history.setPaused(on)} /></div>
      <button class="pill ghost danger" onclick={() => (confirming = true)} disabled={!history.entries.length}><Icon name="trash" size={15} />Clear history…</button>
    </div>
  </div>

  {#if history.error}
    <Status error={history.error} onretry={() => history.load()} />
  {:else if !history.loaded}
    <Status loading />
  {:else}
    {#each days as group (group.day)}
      <section class="group">
        <h2>{group.label}<span class="count">{plays(group.entries.length)}</span></h2>
        <ol>
          {#each group.entries as entry, i (entry.at + entry.uri + i)}
            <SongRow song={entry} note={clock.format(entry.at)} tag={sources.length > 1 && !source ? sourceLabel(entry.source) : ""} />
          {/each}
        </ol>
      </section>
    {:else}
      <Status empty={history.paused ? "History is paused. Turn it back on and the songs you play show up here." : "Nothing here yet. A song lands here once you've heard half of it, or four minutes."} />
    {/each}
    {#if total > shown}
      <button class="pill earlier" onclick={() => (shown += PAGE)}>Show earlier plays</button>
    {/if}
  {/if}
{:else if !ratings.loaded}
  <Status loading />
{:else}
  {#each rated as group (group.stars)}
    <section class="group">
      <h2>
        <span class="stars" role="img" aria-label={starsText(group.stars)}>
          {#each { length: group.stars }, i (i)}<Icon name="star" size={18} filled />{/each}
        </span>
        <span class="count">{songs(group.ratings.length)}</span>
      </h2>
      <ol>
        {#each group.ratings as rating (rating.uri)}
          <SongRow song={rating} />
        {/each}
      </ol>
    </section>
  {:else}
    <Status empty="No rated songs yet. Point at a song in any list and pick its stars." />
  {/each}
{/if}

{#if confirming}
  <Modal title="Clear your history?" onclose={() => (confirming = false)}>
    <p class="confirm">Every play Carbon has kept on this PC is removed, and your recap starts over. Ratings and bookmarks stay. This can't be undone.</p>
    <div class="actions">
      <button class="pill" onclick={() => (confirming = false)}>Keep it</button>
      <button class="pill danger solid" onclick={clear}>Clear history</button>
    </div>
  </Modal>
{/if}

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

  .segmented {
    margin-left: auto;
  }

  .tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-3) var(--sp-5);
    margin-bottom: var(--sp-5);
  }

  .filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .filter .pill {
    height: 32px;
    padding: 0 var(--sp-3);
    font-size: var(--fs-small);
  }

  .filter .pill.active {
    background: var(--paper);
    color: var(--ink);
  }

  .switches {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin-left: auto;
  }

  /* The toggle is a full-width settings row elsewhere; here it only needs its label and switch. */
  .pause :global(.toggle) {
    padding: 0;
    gap: var(--sp-3);
  }

  .switches .pill {
    align-self: center;
  }

  .group {
    margin-bottom: var(--sp-5);
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-bottom: var(--sp-2);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .count {
    color: var(--text-faint);
    font-family: var(--font-text);
    font-size: var(--fs-small);
    font-weight: 500;
    letter-spacing: 0;
  }

  .stars {
    display: inline-flex;
    gap: 2px;
    align-self: center;
    color: var(--accent);
  }

  ol {
    list-style: none;
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
  }

  .earlier {
    display: flex;
    margin: 0 auto;
  }

  .confirm {
    margin: 0 0 var(--sp-5);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }
</style>
