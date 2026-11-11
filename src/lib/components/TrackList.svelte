<script lang="ts">
  import { formatDuration } from "$lib/format";
  import { hasPage, isLocalUri } from "$lib/local/tracks";
  import { isYoutubeUri, pageHref } from "$lib/youtube/uri";
  import { menu } from "$lib/menu.svelte";
  import { trackMenu } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import type { PlaylistSummary, Track } from "$lib/spotify/types";
  import AddToCarbon from "./AddToCarbon.svelte";
  import Icon from "./Icon.svelte";
  import LikeButton from "./LikeButton.svelte";

  let {
    tracks,
    contextUri,
    showAlbum = false,
    showArt = true,
    numbered = false,
    compact = false,
    removeFrom,
    onremove,
  }: {
    tracks: Track[];
    /** Play inside this album/playlist/collection so next/prev follow it. */
    contextUri?: string;
    showAlbum?: boolean;
    showArt?: boolean;
    numbered?: boolean;
    compact?: boolean;
    /** Lets the menu remove songs from this playlist (only pass for playlists you can edit). */
    removeFrom?: Pick<PlaylistSummary, "id" | "name">;
    onremove?: (uri: string) => void;
  } = $props();

  const openMenu = (event: MouseEvent | KeyboardEvent, track: Track) =>
    menu.open(event, trackMenu(track, { removeFrom, onRemoved: () => onremove?.(track.uri) }));

  function play(index: number) {
    const track = tracks[index];
    // YouTube Music lists play from what is loaded here (long playlists load page by page).
    if (isYoutubeUri(track.uri)) player.playQueue(tracks, index, contextUri);
    else if (contextUri) player.playContext(contextUri, track.uri);
    else player.playTracks(tracks.map((t) => t.uri), index, tracks);
  }
</script>

<ol class="tracks" class:compact class:with-album={showAlbum}>
  {#each tracks as track, i (track.uri + i)}
    {@const current = player.isCurrent(track.uri)}
    <li class="row" class:current ondblclick={() => play(i)} oncontextmenu={(e) => openMenu(e, track)}>
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
              {#if j > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
            {/each}
          </span>
        </div>
      </div>
      {#if showAlbum}
        <span class="album">
          {#if hasPage(track.album)}<a href={pageHref("album", track.album!)}>{track.album?.name}</a>{:else}{track.album?.name ?? ""}{/if}
        </span>
      {/if}
      <!-- Carbon playlists can hold Spotify songs, so YouTube Music songs stay out of them. -->
      <span class="carbon-btn">{#if !isYoutubeUri(track.uri)}<AddToCarbon tracks={[track]} />{/if}</span>
      <!-- Liked Songs is Spotify-only; the empty cell keeps local rows on the grid. -->
      {#if isLocalUri(track.uri)}<span></span>{:else}<LikeButton uri={track.uri} label={track.name} />{/if}
      <span class="duration tabular">{formatDuration(track.durationMs)}</span>
      <button class="more" onclick={(e) => openMenu(e, track)} aria-label="More options for {track.name}" aria-haspopup="menu" title="More">
        <Icon name="more" size={16} />
      </button>
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
    grid-template-columns: 36px minmax(0, 1fr) 28px 32px 52px 32px;
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
    grid-template-columns: 36px minmax(0, 1.4fr) minmax(0, 1fr) 28px 32px 52px 32px;
  }

  .compact .row {
    height: 50px;
    grid-template-columns: 28px minmax(0, 1fr) 28px 28px 44px 28px;
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

  .row :global(.like:not(.on)),
  .more {
    opacity: 0;
  }

  .row:hover :global(.like),
  .row :global(.like:focus-visible),
  .row:hover .more,
  .more:focus-visible {
    opacity: 1;
  }

  .more {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition: opacity var(--dur-fast);
  }

  .carbon-btn {
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .row:hover .carbon-btn,
  .carbon-btn:focus-within {
    opacity: 1;
  }

  .more:hover {
    color: var(--text);
    background: var(--glass-active);
  }

  .duration {
    font-size: var(--fs-small);
    color: var(--text-faint);
    text-align: right;
  }
</style>
