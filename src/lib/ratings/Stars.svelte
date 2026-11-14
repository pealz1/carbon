<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { isSong } from "$lib/history/song";
  import type { Track } from "$lib/spotify/types";
  import { MAX_STARS, starsForClick, starsForKey, starsText } from "./ratings";
  import { ratings } from "./ratings.svelte";

  // A song's star rating. One tab stop (a slider: arrows step, 0 to 5 set, Delete clears) with five
  // stars to click; clicking the star it already has clears it. `quiet` is for track rows: it
  // shows on hover and focus, and always once the song is rated. `bar` is for the player bar.
  let { track, size = 14, quiet = false, bar = false }: { track: Track; size?: number; quiet?: boolean; bar?: boolean } = $props();

  const value = $derived(ratings.of(track.uri));

  function click(event: MouseEvent) {
    event.stopPropagation();
    const star = Number((event.target as Element).closest<HTMLElement>("[data-star]")?.dataset.star);
    if (star) void ratings.rate(track, starsForClick(star, value));
  }

  function key(event: KeyboardEvent) {
    const next = starsForKey(event.key, value);
    if (next === null || event.ctrlKey || event.altKey || event.metaKey) return;
    // The app's own shortcuts (arrows for volume, say) don't also run.
    event.preventDefault();
    event.stopPropagation();
    if (next !== value) void ratings.rate(track, next);
  }
</script>

{#if isSong(track.uri)}
  <span
    class="stars"
    class:quiet
    class:bar
    class:rated={value > 0}
    role="slider"
    tabindex="0"
    aria-label="Rating for {track.name}"
    aria-valuemin={0}
    aria-valuemax={MAX_STARS}
    aria-valuenow={value}
    aria-valuetext={starsText(value)}
    title={value ? `${starsText(value)}. Click a star to change it.` : "Rate this song"}
    onclick={click}
    ondblclick={(e) => e.stopPropagation()}
    onkeydown={key}
  >
    {#each { length: MAX_STARS }, i (i)}
      <span class="star" class:on={i < value} data-star={i + 1}><Icon name="star" {size} filled={i < value} /></span>
    {/each}
  </span>
{/if}

<style>
  .stars {
    flex: none;
    display: inline-flex;
    align-items: center;
    border-radius: var(--r-sm);
    cursor: pointer;
    transition: opacity var(--dur-fast);
  }

  .star {
    display: grid;
    place-items: center;
    padding: 3px 1px;
    color: inherit;
    opacity: 0.4;
    transition:
      opacity var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .star.on {
    color: var(--accent);
    opacity: 1;
  }

  /* Hovering previews the rating a click would give: lit up to the pointer, plain after it. */
  .stars:hover .star {
    color: var(--accent);
    opacity: 1;
  }

  .stars:hover .star:hover ~ .star {
    color: inherit;
    opacity: 0.4;
  }

  .star:active {
    transform: scale(var(--press));
  }

  /* In a track row: out of the way until the row is pointed at or the control has focus. */
  .quiet {
    margin-left: auto;
    opacity: 0;
  }

  :global(.row:hover) .quiet,
  .quiet:focus-visible,
  .quiet.rated {
    opacity: 1;
  }

  /* Compact lists (queue, search) have no room: only a rating that exists is shown. */
  :global(.tracks.compact) .quiet:not(.rated) {
    display: none;
  }

  /* The player bar gives its space to the title in a narrow window. */
  @media (max-width: 1100px) {
    .bar:not(.rated) {
      display: none;
    }
  }
</style>
