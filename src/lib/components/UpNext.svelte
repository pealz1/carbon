<script lang="ts">
  import { formatTotal, joinNames } from "$lib/format";
  import { player } from "$lib/player.svelte";
  import type { Track } from "$lib/spotify/types";
  import { view } from "$lib/view.svelte";
  import { isYoutubeUri } from "$lib/youtube/uri";
  import BarPopover from "./BarPopover.svelte";
  import Icon from "./Icon.svelte";

  // Cinema's "Up next" chip: names the next song, and opens (on hover or click) onto the next few,
  // any of which plays on a click. The whole queue is one step away in the queue panel.
  let { tracks, exact }: { tracks: Track[]; exact: boolean } = $props();

  const PEEK = 3;
  const more = $derived(tracks.length - PEEK);
  const rest = $derived(tracks.slice(PEEK).reduce((sum, t) => sum + t.durationMs, 0));

  /** Same as picking it in the queue panel: the queue from that song on. */
  function play(index: number) {
    if (isYoutubeUri(tracks[index].uri)) void player.playQueue(tracks, index);
    else void player.playTracks(tracks.map((t) => t.uri), index, tracks);
  }

  function showQueue() {
    void view.exitCinema();
    view.queue = true;
  }
</script>

<BarPopover label="Up next" peek trigger="chip">
  {#snippet button()}
    <Icon name="queue" size={16} />
    <span class="chip-text">
      <span class="kicker">Up next</span>
      <span class="next">{tracks[0]?.name}</span>
    </span>
  {/snippet}
  <h3 class="head">Up next</h3>
  <ol>
    {#each tracks.slice(0, PEEK) as track, i (track.uri + i)}
      <li>
        <button class="item" onclick={() => play(i)} aria-label="Play {track.name}">
          {#if track.album?.image}
            <img src={track.album.image} alt="" width="40" height="40" loading="lazy" />
          {:else}
            <span class="blank"><Icon name="note" size={16} /></span>
          {/if}
          <span class="meta">
            <span class="name">{track.name}</span>
            <span class="by">{joinNames(track.artists)}</span>
          </span>
          <span class="go"><Icon name="play" size={12} /></span>
        </button>
      </li>
    {/each}
  </ol>
  <footer>
    <span class="rest">{more > 0 ? `${more} more${exact ? ` · ${formatTotal(rest)}` : ""}` : ""}</span>
    <button class="pill ghost" onclick={showQueue}>Full queue</button>
  </footer>
</BarPopover>

<style>
  .chip-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    text-align: left;
    line-height: 1.2;
  }

  .kicker {
    font-size: var(--fs-micro);
    font-weight: 600;
    color: var(--text-muted);
  }

  .next {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .head {
    margin: 0 var(--sp-2) var(--sp-2);
    font-size: var(--fs-caption);
    font-weight: 600;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  ol {
    width: 300px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 6px var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .item:hover {
    background: var(--glass-hover);
  }

  .item:active {
    transform: scale(var(--press-wide));
  }

  img,
  .blank {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass);
    color: var(--text-muted);
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .name,
  .by {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .by {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .go {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    opacity: 0;
    transform: scale(0.8);
    transition:
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .item:hover .go,
  .item:focus-visible .go {
    opacity: 1;
    transform: scale(1);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-top: var(--sp-2);
    padding: var(--sp-2) 0 0 var(--sp-2);
    border-top: 1px solid var(--glass-edge);
  }

  .rest {
    font-size: var(--fs-caption);
    color: var(--text-muted);
  }

  footer .pill {
    height: 30px;
    padding: 0 var(--sp-3);
    font-size: var(--fs-small);
  }
</style>
