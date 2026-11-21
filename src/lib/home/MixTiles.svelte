<script lang="ts" module>
  import type { Track } from "$lib/spotify/types";

  export interface Mix {
    id: string;
    title: string;
    tracks: Track[];
    /** The tile's colour, as an oklch hue. */
    hue: number;
  }
</script>

<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";

  // Mixes made for the listener (moods, daily mixes): a tile each, four covers and a Play button.
  // Choosing the tile opens its songs; Play starts it.
  let { title, mixes, onopen }: { title: string; mixes: Mix[]; onopen: (id: string) => void } = $props();

  const covers = (mix: Mix) => [...new Set(mix.tracks.map((tr) => tr.album?.image).filter((src): src is string => !!src))].slice(0, 4);
  const play = (mix: Mix) => void player.playTracks(mix.tracks.map((tr) => tr.uri), 0, mix.tracks);
</script>

{#if mixes.length}
  <section class="mixes">
    <h2>{title}</h2>
    <ul>
      {#each mixes as mix, i (mix.id)}
        <li style="--hue: {mix.hue}; --i: {i}">
          <button class="tile" onclick={() => onopen(mix.id)} aria-label="{t(mix.title)}, {mix.tracks.length} {t('songs')}">
            <span class="covers" aria-hidden="true">
              {#each covers(mix) as cover (cover)}<img src={cover} alt="" width="72" height="72" loading="lazy" decoding="async" draggable="false" />{/each}
            </span>
            <span class="name">{t(mix.title)}</span>
            <span class="count tabular">{mix.tracks.length} {t("songs")}</span>
          </button>
          <button class="play" onclick={() => play(mix)} aria-label="{t('Play')} {t(mix.title)}"><Icon name="play" size={16} /></button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .mixes {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    animation: mix-in 420ms var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 40ms);
  }

  .tile {
    position: relative;
    isolation: isolate;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
    padding: var(--sp-3) var(--sp-3) var(--sp-4);
    overflow: hidden;
    border-radius: var(--r-xl);
    background: var(--plate);
    box-shadow: var(--rim);
    text-align: left;
    transition:
      box-shadow var(--dur-med),
      translate var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  /* The mix's colour, pooled behind the covers. */
  .tile::before {
    content: "";
    position: absolute;
    inset: -30% -10% 30% -10%;
    z-index: -1;
    background: radial-gradient(closest-side, oklch(58% 0.17 var(--hue) / 0.5), transparent);
    opacity: 0.7;
    transition:
      opacity var(--dur-med),
      transform var(--dur-slow) var(--ease-out);
  }

  li:hover .tile {
    translate: 0 -3px;
    box-shadow:
      var(--rim-hover),
      0 18px 40px -22px oklch(45% 0.15 var(--hue) / 0.9);
  }

  li:hover .tile::before {
    opacity: 1;
    transform: scale(1.12);
  }

  /* Four covers fanned like a hand of cards; they spread a little under the pointer. */
  .covers {
    display: flex;
    height: 84px;
    margin-bottom: var(--sp-3);
    padding-left: 6px;
  }

  .covers img {
    width: 72px;
    height: 72px;
    margin-left: -22px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
    box-shadow: 0 10px 22px -10px rgb(0 0 0 / 0.85);
    rotate: calc((var(--n) - 1.5) * 5deg);
    transition: translate var(--dur-spring) var(--ease-spring);
  }

  .covers img:first-child {
    margin-left: 0;
  }

  .covers img:nth-child(1) {
    --n: 0;
  }

  .covers img:nth-child(2) {
    --n: 1;
  }

  .covers img:nth-child(3) {
    --n: 2;
  }

  .covers img:nth-child(4) {
    --n: 3;
  }

  li:hover .covers img {
    translate: calc(var(--n) * 5px) -3px;
  }

  .name {
    font-size: var(--fs-lead);
    font-weight: 750;
  }

  .count {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .play {
    position: absolute;
    right: var(--sp-3);
    bottom: var(--sp-3);
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    box-shadow: 0 8px 18px -8px rgb(0 0 0 / 0.7);
    color: var(--ink);
    transition:
      scale var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
  }

  .play:hover {
    scale: 1.08;
  }

  @keyframes mix-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.96);
    }
  }
</style>
