<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { startArtistRadio } from "$lib/spotify/artist-mix";
  import type { Card } from "$lib/spotify/types";

  // "Your radio": a station per artist the listener plays most. A station is that artist's songs
  // taken in turn with the artists beside them, so no two stations play the same run.
  let { title, artists, wrap = false }: { title: string; artists: Card[]; wrap?: boolean } = $props();

  const STATION_ARTISTS = 3;
  let starting = $state<string | null>(null);

  async function start(index: number) {
    // The artist, then the next ones along the row (wrapping round).
    const picked = [...new Set(Array.from({ length: STATION_ARTISTS }, (_, step) => artists[(index + step) % artists.length]))];
    starting = artists[index].id;
    try {
      await startArtistRadio(null, picked.map((a) => ({ id: a.id, name: a.title })));
    } finally {
      starting = null;
    }
  }
</script>

{#if artists.length}
  <section class="radio">
    <h2>{title}</h2>
    <ul class:wrap>
      {#each artists as artist, i (artist.id)}
        <li style="--i: {i}">
          <button class="station" onclick={() => start(i)} disabled={starting !== null} aria-busy={starting === artist.id} aria-label="Radio: {artist.title}">
            <span class="disc">
              {#if artist.image}<img src={artist.image} alt="" width="112" height="112" loading="lazy" decoding="async" draggable="false" />{:else}<Icon name="artist" size={30} />{/if}
              <span class="badge"><Icon name={starting === artist.id ? "spark" : "radio"} size={14} /></span>
            </span>
            <span class="name">{artist.title}</span>
            <span class="kind">Radio</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .radio {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  ul {
    display: flex;
    gap: var(--sp-3);
    margin: 0 calc(var(--page-x, 0px) * -1);
    padding: 6px var(--page-x, 0px);
    overflow-x: auto;
    list-style: none;
  }

  ul.wrap {
    flex-wrap: wrap;
    margin: 0;
    padding: 6px 0;
    overflow: visible;
  }

  li {
    flex: none;
    animation: station-in 400ms var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 30ms);
  }

  .station {
    width: 128px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--sp-2);
    border-radius: var(--r-lg);
    transition:
      background var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  .station:hover:not(:disabled) {
    background: var(--glass-hover);
  }

  .station:disabled {
    cursor: default;
  }

  .disc {
    position: relative;
    width: 112px;
    height: 112px;
    display: grid;
    place-items: center;
    margin-bottom: var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--graphite-800);
    color: var(--text-faint);
    box-shadow: 0 12px 28px -14px rgb(0 0 0 / 0.9);
    transition: scale var(--dur-spring) var(--ease-spring);
  }

  .station:hover:not(:disabled) .disc {
    scale: 1.05;
  }

  .disc img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  /* The station mark sits on the disc's edge, like a dial on a set. */
  .badge {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--stage);
    color: var(--accent-ink);
  }

  [aria-busy="true"] .badge {
    animation: tuning 900ms var(--ease-out) infinite;
  }

  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .kind {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  @keyframes station-in {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  @keyframes tuning {
    50% {
      transform: scale(1.18);
    }
  }
</style>
