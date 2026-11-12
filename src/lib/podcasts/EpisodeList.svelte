<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { formatDuration } from "$lib/format";
  import { hold } from "$lib/hold";
  import { menu } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import type { Episode } from "./api";
  import { episodeMenu } from "./menus";

  // A show's episodes: newest first, with where you left off and which ones you've finished.
  let { episodes }: { episodes: Episode[] } = $props();

  const date = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : (iso ?? ""));
  const left = (e: Episode) => `${Math.max(1, Math.round((e.durationMs - e.resumeMs) / 60_000))} min left`;
  const play = (e: Episode) => (player.isCurrent(e.uri) ? player.togglePlay() : player.playEpisode(e.uri, e.resumeMs));
  const holdFor = (e: Episode) => ({ onhold: (at: { x: number; y: number }, node: HTMLElement) => menu.openAt(at.x, at.y, episodeMenu(e), node) });
</script>

<ol class="episodes">
  {#each episodes as e (e.id)}
    {@const current = player.isCurrent(e.uri)}
    <li class="episode" class:current class:played={e.played} oncontextmenu={(ev) => menu.open(ev, episodeMenu(e))} use:hold={holdFor(e)}>
      {#if e.image}<img src={e.image} alt="" width="64" height="64" loading="lazy" decoding="async" />{:else}<span class="blank"></span>{/if}
      <div class="text">
        <span class="name">{e.name}{#if e.explicit}<span class="explicit" aria-label="Explicit">E</span>{/if}</span>
        <p class="description">{e.description}</p>
        <span class="meta tabular">
          {date(e.releaseDate)} · {formatDuration(e.durationMs)}
          {#if e.played}
            <span class="done"><Icon name="check" size={13} />Played</span>
          {:else if e.resumeMs}
            <span class="progress" aria-hidden="true"><span style="transform: scaleX({Math.min(1, e.resumeMs / Math.max(1, e.durationMs))})"></span></span>
            {left(e)}
          {/if}
        </span>
      </div>
      <div class="actions">
        <button class="play" onclick={() => play(e)} aria-label="{current && !player.paused ? 'Pause' : e.resumeMs ? 'Resume' : 'Play'} {e.name}">
          <Icon name={current && !player.paused ? "pause" : "play"} size={16} />
        </button>
        <button class="more" onclick={(ev) => menu.open(ev, episodeMenu(e))} aria-label="More options for {e.name}" aria-haspopup="menu" title="More">
          <Icon name="more" size={16} />
        </button>
      </div>
    </li>
  {/each}
</ol>

<style>
  .episodes {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .episode {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    gap: var(--sp-4);
    align-items: center;
    padding: var(--sp-3) var(--sp-2);
    border-radius: var(--r-md);
    content-visibility: auto;
    contain-intrinsic-size: auto 112px;
    transition: background var(--dur-fast);
  }

  .episode + .episode {
    box-shadow: inset 0 1px 0 var(--glass-edge);
  }

  .episode:hover,
  .episode:focus-within {
    background: var(--glass-hover);
  }

  img,
  .blank {
    width: 64px;
    height: 64px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .blank {
    background: var(--graphite-800);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .name {
    font-weight: 600;
    font-size: var(--fs-lead);
  }

  .current .name {
    color: var(--accent);
  }

  .played .name {
    color: var(--text-muted);
  }

  .explicit {
    display: inline-grid;
    place-items: center;
    width: 15px;
    height: 15px;
    margin-left: var(--sp-1);
    border-radius: 3px;
    background: rgb(255 255 255 / 0.2);
    font-size: 9px;
    font-weight: 800;
    vertical-align: 2px;
  }

  .description {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.45;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .done {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--accent);
    font-weight: 600;
  }

  .progress {
    width: 64px;
    height: 3px;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    overflow: hidden;
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
  }

  .actions {
    display: flex;
    gap: var(--sp-1);
  }

  .play,
  .more {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .play {
    background: var(--paper);
    color: var(--ink);
  }

  .more {
    color: var(--text-muted);
  }

  .more:hover {
    color: var(--text);
    background: var(--glass-active);
  }
</style>
