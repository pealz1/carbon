<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { formatDuration } from "$lib/format";
  import { hold } from "$lib/hold";
  import { menu } from "$lib/menu.svelte";
  import { trackMenu } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import Stars from "$lib/ratings/Stars.svelte";
  import { playOne } from "./play";
  import { trackOf, type Song } from "./song";

  // One remembered song (a play in the history, a rated song). It plays on its own rather than as
  // part of the list around it, which can mix services. `note` leads the row: the time of a play.
  let { song, note = "", tag = "" }: { song: Song; note?: string; tag?: string } = $props();

  const track = $derived(trackOf(song));
  const current = $derived(player.isCurrent(song.uri));
  const play = () => (current ? player.togglePlay() : playOne(track));
</script>

<li class="row" class:current class:noted={!!note} ondblclick={play} oncontextmenu={(e) => menu.open(e, trackMenu(track))} use:hold={{ onhold: (at, node) => menu.openAt(at.x, at.y, trackMenu(track), node) }}>
  <button class="lead" onclick={play} aria-label="{current && !player.paused ? 'Pause' : 'Play'} {song.title}">
    <span class="note tabular">{note}</span>
    <span class="play-icon"><Icon name={current && !player.paused ? "pause" : "play"} size={14} /></span>
  </button>
  <div class="main">
    <!-- Artwork is shown whole and bare: the play control is the lead button, never on the cover. -->
    {#if song.image}
      <img src={song.image} alt="" width="40" height="40" loading="lazy" decoding="async" />
    {:else}
      <span class="blank"><Icon name="note" size={16} /></span>
    {/if}
    <div class="text">
      <span class="name">{song.title}</span>
      <span class="by">{song.artists.join(", ")}{#if tag}<span class="tag">{tag}</span>{/if}</span>
    </div>
  </div>
  <span class="album">{song.album}</span>
  <Stars {track} quiet />
  <span class="duration tabular">{song.durationMs ? formatDuration(song.durationMs) : ""}</span>
  <button class="more" onclick={(e) => menu.open(e, trackMenu(track))} aria-label="More options for {song.title}" aria-haspopup="menu" title="More">
    <Icon name="more" size={16} />
  </button>
</li>

<style>
  .row {
    --lead: 32px;
    display: grid;
    grid-template-columns: var(--lead) minmax(0, 1.4fr) minmax(0, 1fr) auto 48px 30px;
    align-items: center;
    gap: var(--sp-3);
    height: 54px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    content-visibility: auto;
    contain-intrinsic-size: auto 54px;
    transition: background var(--dur-fast);
  }

  /* A play's time needs more room than a play icon. */
  .row.noted {
    --lead: 64px;
  }

  .row:hover,
  .row:focus-within {
    background: var(--glass-hover);
  }

  .lead {
    position: relative;
    height: 32px;
    display: grid;
    place-items: center start;
    padding-left: var(--sp-1);
    border-radius: var(--r-sm);
    color: var(--text-faint);
  }

  .note {
    font-size: var(--fs-small);
    white-space: nowrap;
  }

  .play-icon {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center start;
    padding-left: var(--sp-2);
    color: var(--text);
    opacity: 0;
  }

  .row:hover .play-icon,
  .lead:focus-visible .play-icon,
  .row.current:not(.noted) .play-icon {
    opacity: 1;
  }

  .row:hover .note,
  .lead:focus-visible .note {
    opacity: 0;
  }

  .main {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  .main img,
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
    background: var(--glass-active);
    color: var(--text-faint);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .name,
  .by,
  .album {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .row.current .name {
    color: var(--accent);
  }

  .by,
  .album {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .tag {
    margin-left: var(--sp-2);
    color: var(--text-faint);
  }

  .tag::before {
    content: "\00b7";
    margin-right: var(--sp-2);
  }

  .duration {
    color: var(--text-faint);
    font-size: var(--fs-small);
    text-align: right;
  }

  .more {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .row:hover .more,
  .more:focus-visible {
    opacity: 1;
  }

  .more:hover {
    color: var(--text);
    background: var(--glass-active);
  }

  /* A narrow stage drops the album so the title keeps its room. */
  @container stage (max-width: 760px) {
    .album {
      display: none;
    }

    .row {
      grid-template-columns: var(--lead) minmax(0, 1fr) auto 48px 30px;
    }
  }
</style>
