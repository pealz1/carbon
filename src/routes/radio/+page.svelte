<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { player } from "$lib/player.svelte";
  import { describe, stations, type Station } from "$lib/radio/api";
  import { favourites } from "$lib/radio/favourites.svelte";
  import { RADIO_PREFIX } from "$lib/radio/uri";
  import { resource } from "$lib/resource.svelte";

  // Internet radio from Radio Browser's open directory: search by name, browse a genre, keep the
  // ones you like. The search and the genre live in the address, so Back returns to the same list.
  const DEBOUNCE_MS = 320;
  const GENRES = ["pop", "rock", "jazz", "classical", "electronic", "hip hop", "lofi", "ambient", "news", "talk"];
  const initial = page.url.searchParams.get("q") ?? "";
  let query = $state(initial);
  let term = $state(initial.trim());
  const tag = $derived(page.url.searchParams.get("tag") ?? "");

  const address = (q: string, genre: string) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(genre && { tag: genre }) });
    return `?${params}`;
  };

  $effect(() => {
    const next = query.trim();
    const timer = setTimeout(() => {
      if (next === term) return;
      term = next;
      void goto(address(next, tag), { replaceState: true, keepFocus: true, noScroll: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const pickGenre = (genre: string) => goto(address(term, genre === tag ? "" : genre), { replaceState: true, keepFocus: true, noScroll: true });

  const found = resource(() => stations(term, tag));
  const browsing = $derived(!term && !tag);
  const heading = $derived(term ? `Stations matching “${term}”` : tag ? `${tag[0].toUpperCase()}${tag.slice(1)} stations` : "Most listened to");
  const playing = (station: Station) => player.track?.uri === RADIO_PREFIX + station.id;
</script>

<header class="page-head">
  <div class="title">
    <h1>Radio</h1>
    <p class="status">Live stations from around the world, from the open Radio Browser directory.</p>
  </div>
</header>

<div class="field">
  <Icon name="search" size={20} />
  <input bind:value={query} placeholder="Find a station" aria-label="Search radio stations" spellcheck="false" />
</div>

<div class="genres" role="group" aria-label="Genres">
  {#each GENRES as genre (genre)}
    <button class="pill" class:active={tag === genre} aria-pressed={tag === genre} onclick={() => pickGenre(genre)}>{genre}</button>
  {/each}
</div>

{#if browsing && favourites.list.length}
  <section>
    <h2>Your stations</h2>
    <ul class="stations">
      {#each favourites.list as station (station.id)}{@render row(station)}{/each}
    </ul>
  </section>
{/if}

<section aria-busy={found.loading}>
  <h2>{heading}</h2>
  {#if found.loading && !found.data}
    <Status loading />
  {:else if found.error}
    <Status error={found.error} onretry={found.reload} />
  {:else if found.data?.length}
    <ul class="stations" class:stale={found.loading}>
      {#each found.data as station (station.id)}{@render row(station)}{/each}
    </ul>
  {:else}
    <Status empty="No stations match that. Try a shorter name or another genre." />
  {/if}
</section>

{#snippet row(station: Station)}
  {@const on = playing(station)}
  {@const kept = favourites.has(station.id)}
  <li class:on>
    <button class="play" onclick={() => (on ? player.togglePlay() : player.playStation(station))} aria-label="{on && !player.paused ? 'Pause' : 'Play'} {station.name}">
      <span class="art">
        {#if station.icon}
          <img src={station.icon} alt="" width="44" height="44" loading="lazy" onerror={(e) => (e.currentTarget as HTMLImageElement).remove()} />
        {/if}
        <span class="glyph"><Icon name={on && !player.paused ? "pause" : on ? "play" : "radio"} size={20} /></span>
      </span>
      <span class="meta">
        <span class="name">{station.name}</span>
        <span class="about">{describe(station) || "Radio station"}</span>
      </span>
    </button>
    <button class="keep" class:kept aria-pressed={kept} onclick={() => favourites.toggle(station)} aria-label="{kept ? 'Remove' : 'Keep'} {station.name} {kept ? 'from' : 'in'} your stations" title={kept ? "Remove from your stations" : "Keep in your stations"}>
      <Icon name="heart" size={17} filled={kept} />
    </button>
  </li>
{/snippet}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .status {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 48px;
    max-width: 520px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .field:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  input {
    flex: 1;
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }

  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: var(--sp-4) 0 var(--sp-6);
  }

  .genres .pill {
    height: 32px;
    padding: 0 var(--sp-3);
    font-size: var(--fs-small);
    text-transform: capitalize;
  }

  .genres .pill.active {
    background: var(--accent);
    color: var(--accent-ink);
  }

  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .stations {
    list-style: none;
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2px var(--sp-4);
    transition: opacity var(--dur-fast);
  }

  .stations.stale {
    opacity: 0.5;
  }

  li {
    display: flex;
    align-items: center;
    min-width: 0;
    border-radius: var(--r-md);
    transition: background var(--dur-fast);
  }

  li:hover,
  li:focus-within {
    background: var(--glass-hover);
  }

  .play {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    color: inherit;
    text-align: left;
  }

  .art {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--glass-active);
    color: var(--text-muted);
    overflow: hidden;
  }

  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--plate);
  }

  /* Over artwork the glyph only shows when it means something: hover, or this station playing. */
  .art img + .glyph {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.55);
    color: var(--text);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  li:hover .glyph,
  .play:focus-visible .glyph,
  li.on .glyph {
    opacity: 1;
  }

  .meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name,
  .about {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  li.on .name {
    color: var(--accent);
  }

  .about {
    color: var(--text-muted);
    font-size: var(--fs-small);
    text-transform: capitalize;
  }

  .keep {
    flex: none;
    width: 36px;
    height: 36px;
    margin-right: var(--sp-1);
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-faint);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  li:hover .keep,
  .keep:focus-visible,
  .keep.kept {
    opacity: 1;
  }

  .keep:hover {
    color: var(--text);
    transform: scale(1.1);
  }

  .keep.kept {
    color: var(--accent);
  }
</style>
