<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import Status from "$lib/components/Status.svelte";
  import { hold } from "$lib/hold";
  import { menu } from "$lib/menu.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { savedShows, type Show } from "$lib/podcasts/api";
  import { showMenu } from "$lib/podcasts/menus";

  // Your saved shows. Episodes play in Carbon through Spotify's player.
  const shows = new Pager<Show>((offset) => savedShows(offset));
  const holdFor = (show: Show) => ({ onhold: (at: { x: number; y: number }, node: HTMLElement) => menu.openAt(at.x, at.y, showMenu(show), node) });
</script>

<header class="page-head"><h1>Podcasts</h1></header>

<div class="grid">
  {#each shows.items as show (show.id)}
    <a href="/show/{show.id}" class="show pressable" oncontextmenu={(e) => menu.open(e, showMenu(show))} use:hold={holdFor(show)}>
      <span class="art">
        {#if show.image}
          <img src={show.image} alt="" width="300" height="300" loading="lazy" decoding="async" draggable="false" />
        {:else}
          <span class="placeholder"><Icon name="podcast" size={34} /></span>
        {/if}
      </span>
      <span class="title">{show.name}</span>
      <span class="publisher">{show.publisher}</span>
    </a>
  {/each}
</div>
{#if shows.done && !shows.items.length && !shows.error}
  <Status empty="Shows you follow on Spotify show up here." />
{/if}
<LoadMore pager={shows} />

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }

  .show {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: var(--sp-2);
    border-radius: var(--r-lg);
    color: var(--text);
    text-decoration: none;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  .show:hover {
    background: var(--glass-hover);
    text-decoration: none;
  }

  /* Artwork is never scaled: a press deepens the fill instead. */
  .show:active {
    transform: none;
    background: var(--glass-active);
  }

  .art {
    display: block;
    aspect-ratio: 1;
    margin-bottom: var(--sp-2);
    border-radius: var(--r-art);
    overflow: hidden;
    box-shadow: var(--shadow-art);
  }

  .art img,
  .placeholder {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    display: grid;
    place-items: center;
    background: var(--graphite-800);
    color: var(--text-faint);
  }

  .title,
  .publisher {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title {
    font-weight: 600;
  }

  .publisher {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
