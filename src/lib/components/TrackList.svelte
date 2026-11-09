<script lang="ts">
  import { formatDuration } from "$lib/format";
  import { hasPage } from "$lib/local/tracks";
  import { player } from "$lib/player.svelte";
  import type { Track } from "$lib/spotify/types";
  import AddToCarbon from "./AddToCarbon.svelte";
  import Icon from "./Icon.svelte";

  let {
    tracks,
    contextUri,
    showAlbum = false,
    showArt = true,
    numbered = false,
    compact = false,
  }: {
    tracks: Track[];
    /** Play inside this album/playlist/collection so next/prev follow it. */
    contextUri?: string;
    showAlbum?: boolean;
    showArt?: boolean;
    numbered?: boolean;
    compact?: boolean;
  } = $props();

  function play(index: number) {
    const track = tracks[index];
    if (contextUri) player.playContext(contextUri, track.uri);
    else player.playTracks(tracks.map((t) => t.uri), index, tracks);
  }
</script>

<ol class="tracks" class:compact class:with-album={showAlbum}>
  {#each tracks as track, i (track.uri + i)}
    {@const current = player.isCurrent(track.uri)}
    <li class="row" class:current ondblclick={() => play(i)}>
      <button class="lead" onclick={() => play(i)} aria-label="Play {track.name}">
        {#if current && !player.paused}
          <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>
        {:else if numbered}
          <span class="index tabular">{i + 1}</span>
        {/if}
        <span class="play-icon"><Icon name="play" size={14} /></span>
      </button>
      <div class="main">
        {#if showArt && track.album?.image}
          <img src={track.album.image} alt="" width="40" height="40" loading="lazy" decoding="async" />
        {/if}
        <div class="text">
          <span class="name">
            {track.name}
            {#if track.explicit}<span class="explicit" title="Explicit">E</span>{/if}
          </span>
          <span class="artists">
            {#each track.artists as artist, j (artist.uri)}
              {#if j > 0}{", "}{/if}{#if hasPage(artist)}<a href="/artist/{artist.id}">{artist.name}</a>{:else}{artist.name}{/if}
            {/each}
          </span>
        </div>
      </div>
      {#if showAlbum}
        <span class="album">
          {#if hasPage(track.album)}<a href="/album/{track.album?.id}">{track.album?.name}</a>{:else}{track.album?.name ?? ""}{/if}
        </span>
      {/if}
      <span class="carbon-btn"><AddToCarbon tracks={[track]} /></span>
      <button class="queue-btn" onclick={() => player.addToQueue(track.uri, track)} aria-label="Add {track.name} to queue" title="Add to queue">
        <Icon name="plus" size={16} />
      </button>
      <span class="duration tabular">{formatDuration(track.durationMs)}</span>
    </li>
  {/each}
</ol>

<style>
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 28px 32px 52px;
    align-items: center;
    gap: var(--sp-3);
    height: 56px;
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border-radius: var(--r-md);
    content-visibility: auto;
    contain-intrinsic-size: auto 56px;
    transition: background var(--dur-fast);
  }

  .with-album .row {
    grid-template-columns: 36px minmax(0, 1.4fr) minmax(0, 1fr) 28px 32px 52px;
  }

  .compact .row {
    height: 50px;
    grid-template-columns: 28px minmax(0, 1fr) 28px 28px 44px;
    gap: var(--sp-2);
  }

  .row:hover,
  .row:focus-within {
    background: var(--glass-hover);
  }

  .row.current .name {
    color: var(--accent);
  }

  .lead {
    position: relative;
    height: 32px;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    border-radius: var(--r-sm);
  }

  .play-icon {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text);
    opacity: 0;
  }

  .row:hover .play-icon,
  .lead:focus-visible .play-icon {
    opacity: 1;
  }

  .row:hover .index,
  .row:hover .bars,
  .lead:focus-visible .index {
    opacity: 0;
  }

  .index {
    font-size: var(--fs-small);
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 14px;
  }

  .bars i {
    width: 3px;
    height: 100%;
    border-radius: 1px;
    background: var(--accent);
    transform-origin: bottom;
    animation: bounce 0.9s var(--ease-out) infinite alternate;
  }

  .bars i:nth-child(2) {
    animation-delay: -0.4s;
  }

  .bars i:nth-child(3) {
    animation-delay: -0.7s;
  }

  @keyframes bounce {
    from {
      transform: scaleY(0.25);
    }
    to {
      transform: scaleY(1);
    }
  }

  .main {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  .main img {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: var(--r-sm);
    object-fit: cover;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .artists,
  .album {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .explicit {
    display: inline-grid;
    place-items: center;
    width: 15px;
    height: 15px;
    margin-left: var(--sp-1);
    border-radius: 3px;
    background: var(--text-faint);
    color: var(--accent-ink);
    font-size: 9px;
    font-weight: 800;
    vertical-align: 1px;
  }

  .artists,
  .album {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .queue-btn {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .carbon-btn {
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .row:hover .carbon-btn,
  .carbon-btn:focus-within,
  .row:hover .queue-btn,
  .queue-btn:focus-visible {
    opacity: 1;
  }

  .queue-btn:hover {
    color: var(--text);
    background: var(--glass-active);
  }

  .duration {
    font-size: var(--fs-small);
    color: var(--text-faint);
    text-align: right;
  }
</style>
