<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";
  import { describe, type Station } from "$lib/radio/api";
  import { RADIO_PREFIX } from "$lib/radio/uri";

  // Radio stations among search results. A station plays on its own, so each row is its own button.
  let { stations }: { stations: Station[] } = $props();

  const ICON_SIZE = 40;
</script>

<ul class="stations">
  {#each stations as station (station.id)}
    {@const on = player.isCurrent(RADIO_PREFIX + station.id)}
    {@const playing = on && !player.paused}
    <li class:on>
      <button onclick={() => (on ? player.togglePlay() : player.playStation(station))} aria-label="{playing ? 'Pause' : 'Play'} {station.name}">
        <span class="art">
          {#if station.icon}
            <img src={station.icon} alt="" width={ICON_SIZE} height={ICON_SIZE} loading="lazy" decoding="async" onerror={(e) => (e.currentTarget as HTMLImageElement).remove()} />
          {/if}
          <span class="glyph"><Icon name={playing ? "pause" : on ? "play" : "radio"} size={18} /></span>
        </span>
        <span class="name">{station.name}</span>
        <span class="about">{describe(station) || t("Radio station")}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .stations {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    width: 100%;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition: transform var(--dur-med) var(--ease-spring);
  }

  button:hover {
    background: var(--glass-hover);
  }

  button:active {
    transform: scale(var(--press-wide));
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .art {
    position: relative;
    grid-row: span 2;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--r-art-sm);
    background: oklch(62% 0.15 var(--hue) / 0.2);
    color: var(--text-muted);
  }

  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Over a station's own artwork the glyph only shows on hover or while it plays. */
  .art img + .glyph {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: var(--scrim);
    color: var(--paper);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  button:hover .glyph,
  .on .glyph {
    opacity: 1;
  }

  .name,
  .about {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    align-self: end;
    font-weight: 600;
  }

  .on .name {
    color: var(--accent);
  }

  .about {
    align-self: start;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
