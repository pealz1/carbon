<script lang="ts" module>
  import type { Track } from "$lib/spotify/types";

  export interface Mix {
    id: string;
    title: string;
    tracks: Track[];
    hue: number;
  }
</script>

<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";

  let { title, mixes, onopen, mood = false }: { title: string; mixes: Mix[]; onopen: (id: string) => void; mood?: boolean } = $props();

  let row = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(false);
  function measure() {
    if (!row) return;
    atStart = row.scrollLeft < 4;
    atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  }

  $effect(() => {
    void mixes.length;
    if (!row) return;
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    measure();
    return () => resize.disconnect();
  });

  const shift = (direction: number) => row?.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: "smooth" });
  const covers = (mix: Mix) => [...new Set(mix.tracks.map((track) => track.album?.image).filter((src): src is string => !!src))].slice(0, 2);
  const play = (mix: Mix) => void player.playTracks(mix.tracks.map((track) => track.uri), 0, mix.tracks);
</script>

{#if mixes.length}
  <section class="mixes" class:mood>
    <header>
      <h2>{title}</h2>
      <div class="arrows">
        <button onclick={() => shift(-1)} disabled={atStart} aria-label="Scroll {title} back"><Icon name="back" size={15} /></button>
        <button onclick={() => shift(1)} disabled={atEnd} aria-label="Scroll {title} forward"><Icon name="forward" size={15} /></button>
      </div>
    </header>
    <ul bind:this={row} onscroll={measure}>
      {#each mixes as mix (mix.id)}
        {@const artwork = covers(mix)}
        <li style:--hue={mix.hue}>
          <button class="tile" onclick={() => onopen(mix.id)} aria-label="{t(mix.title)}, {mix.tracks.length} {t('songs')}">
            <span class="artwork">
              {#each artwork as cover, index (cover)}
                <img src={cover} class:secondary={index > 0} alt="" width="220" height="220" loading="lazy" decoding="async" draggable="false" />
              {/each}
              {#if !mood}<span class="headline">{t(mix.title)}</span>{/if}
            </span>
            {#if mood}<span class="caption">{t(mix.title)}</span>{/if}
          </button>
          {#if !mood}
            <button class="play" onclick={() => play(mix)} aria-label="{t('Play')} {t(mix.title)}"><Icon name="play" size={20} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .mixes { margin-block-end: var(--sp-6); }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  h2 { font-size: var(--fs-section); font-weight: 700; }
  .arrows { display: flex; gap: var(--sp-2); }
  .arrows button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
  }
  .arrows button:not(:disabled):hover { background: var(--glass-hover); }
  .arrows button:disabled { opacity: 0.45; cursor: default; }

  ul {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(146px, 16cqw, 216px);
    gap: var(--sp-3);
    margin: 0 calc(var(--page-x, 0px) * -1);
    padding: 0 var(--page-x, 0px) var(--sp-1);
    overflow-x: auto;
    list-style: none;
    scrollbar-width: none;
    scroll-padding: 0 var(--page-x, 0px);
    scroll-snap-type: x proximity;
  }
  li { min-width: 0; position: relative; scroll-snap-align: start; }
  .tile { display: grid; width: 100%; gap: var(--sp-2); text-align: left; }
  .artwork {
    position: relative;
    display: grid;
    place-items: end start;
    aspect-ratio: 1;
    isolation: isolate;
    overflow: hidden;
    border-radius: var(--r-md);
    background: linear-gradient(148deg, oklch(65% 0.15 var(--hue)), oklch(23% 0.08 var(--hue)) 84%);
  }
  .artwork img {
    position: absolute;
    inset: 9% 9% auto auto;
    width: 36%;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-art-sm);
    object-fit: contain;
  }
  .artwork img.secondary {
    inset: 14% 49% auto auto;
    width: 26%;
  }
  .artwork::after {
    position: absolute;
    z-index: -1;
    inset: 0;
    content: "";
    background: linear-gradient(145deg, transparent 20%, oklch(19% 0.09 var(--hue) / 0.84)), rgb(0 0 0 / 0.16);
  }
  .headline {
    padding: var(--sp-4);
    max-width: 100%;
    color: var(--paper);
    font-size: clamp(1.25rem, 2.3cqw, 2rem);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.03;
    overflow-wrap: anywhere;
  }
  .play {
    position: absolute;
    top: var(--sp-2);
    right: var(--sp-2);
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }
  li:hover .play, li:focus-within .play { opacity: 1; }
  @media (hover: none) { .play { opacity: 1; } }
  .mood ul { grid-auto-columns: 94px; }
  .mood .artwork img { display: none; }
  .mood .artwork::after { background: oklch(44% 0.13 var(--hue) / 0.48); }
  .caption { text-align: center; font-size: var(--fs-small); font-weight: 600; }
</style>
