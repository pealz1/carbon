<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { formatDuration } from "$lib/format";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";
  import { embedUrl, openPlayer, parseProviderLink, type Link, type Provider, type Song } from "$lib/providers/catalog";
  import { toasts } from "$lib/toast.svelte";
  import { matchOn } from "./adapters";
  import type { SearchSource } from "./sources";

  // Songs a catalogue lists but Carbon can't play from it. Choosing one plays its closest match on
  // `matcher`, or opens the catalogue's own page for it when nothing there is close enough. A
  // catalogue of whole shows (Mixcloud, Internet Archive) plays in its own embedded player instead.
  let { hits, source, matcher }: { hits: Song[]; source: SearchSource; matcher: SearchSource } = $props();

  const ART = 40;
  const PLAYER_HEIGHT = { track: 180, collection: 380 };

  // Raw: a hit is compared with the row it came from, so it must stay the same object.
  let busy = $state.raw<Song | null>(null);
  let embedded = $state.raw<Link | null>(null);

  /** The hit's own address, only when it really is this source's. */
  function linkOf(hit: Song): Link | null {
    const link = hit.url ? parseProviderLink(hit.url) : null;
    return link?.source === source.id ? link : null;
  }

  async function playMatch(hit: Song, link: Link | null) {
    const match = await matchOn(matcher.id, hit);
    if (match.selected) return player.playTracks([match.selected.uri], 0, [match.selected]);
    if (!link) return toasts.show(t("No close match to play."));
    await openPlayer(link.source as Provider, link.url);
    toasts.show(`${t("No close match. Opened in")} ${source.name}.`);
  }

  async function choose(hit: Song) {
    if (busy) return;
    const link = linkOf(hit);
    if (source.plays === "embed") {
      if (link) embedded = link;
      else toasts.show(t("That one can't be played here."));
      return;
    }
    busy = hit;
    try {
      await playMatch(hit, link);
    } catch (e) {
      console.error("[search] couldn't play a catalogue hit", e);
      toasts.error(describeError(e));
    } finally {
      busy = null;
    }
  }
</script>

{#if embedded}
  <div class="player">
    <iframe
      title="{source.name} player"
      src={embedUrl(embedded)}
      height={embedded.kind === "track" ? PLAYER_HEIGHT.track : PLAYER_HEIGHT.collection}
      allow="autoplay; encrypted-media; fullscreen"
    ></iframe>
    <button class="pill ghost" onclick={() => (embedded = null)}>Close player</button>
  </div>
{/if}

<ul class="hits">
  {#each hits as hit, i (hit.url ?? i)}
    <li>
      <button class="hit" class:busy={busy === hit} onclick={() => choose(hit)} disabled={busy !== null && busy !== hit} aria-busy={busy === hit}>
        <span class="art">
          <Icon name="note" size={16} />
          {#if hit.image}<img src={hit.image} alt="" width={ART} height={ART} loading="lazy" decoding="async" onerror={(e) => (e.currentTarget as HTMLImageElement).remove()} />{/if}
          <span class="glyph"><Icon name="play" size={14} /></span>
        </span>
        <span class="text">
          <span class="name">{hit.title}</span>
          {#if hit.artist}<span class="artist">{hit.artist}</span>{/if}
        </span>
        <span class="duration tabular">{hit.durationMs ? formatDuration(hit.durationMs) : ""}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .hits {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hit {
    width: 100%;
    height: 54px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition:
      opacity var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  li:nth-child(odd) .hit {
    background: var(--row-stripe);
  }

  .hit:hover:not(:disabled) {
    background: var(--glass-hover);
  }

  .hit:active:not(:disabled) {
    transform: scale(var(--press-wide));
  }

  .hit:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .hit:disabled {
    opacity: 0.5;
  }

  .art {
    position: relative;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--r-art-sm);
    background: var(--glass);
    color: var(--text-faint);
  }

  .art img,
  .glyph {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .art img {
    object-fit: cover;
  }

  .glyph {
    display: grid;
    place-items: center;
    background: var(--scrim);
    color: var(--paper);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .hit:hover:not(:disabled) .glyph,
  .hit:focus-visible .glyph {
    opacity: 1;
  }

  /* Looking for the match: the play glyph stays up and breathes. */
  .busy .glyph {
    opacity: 1;
    animation: breathe var(--dur-slow) ease-in-out infinite alternate;
  }

  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name,
  .artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .artist,
  .duration {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .duration {
    padding-right: var(--sp-2);
  }

  .player {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
    margin-bottom: var(--sp-3);
  }

  iframe {
    width: 100%;
    border: 0;
    border-radius: var(--r-lg);
    background: var(--plate);
  }

  @keyframes breathe {
    to {
      opacity: 0.45;
    }
  }
</style>
