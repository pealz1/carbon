<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { player } from "$lib/player.svelte";
  import { names, providerCollection, tidalShared, TIDAL_NO_SONGS, type Link, type Song } from "$lib/providers/catalog";
  import { resource } from "$lib/resource.svelte";
  import type { Track } from "$lib/spotify/types";
  import { matchOn } from "./adapters";
  import { termOf, type Match } from "./match";
  import type { SearchSource } from "./sources";

  // A pasted link from a service Carbon can't play from (Tidal, Apple Music, Deezer): what the
  // link is, from that service's public details, and its closest match on a source that can play.
  let { link, matcher, onsearch }: { link: Link; matcher: SearchSource; onsearch: (text: string) => void } = $props();

  const COVER = 96;
  const KINDS: Record<Link["kind"], string> = { track: "song", album: "album", playlist: "playlist", artist: "artist" };

  interface Read {
    song: Song;
    /** Null for an album or playlist, and when the match couldn't be looked for. */
    match: Match | null;
    problem: string | null;
  }

  async function read(link: Link, on: SearchSource): Promise<Read> {
    const song = link.source === "tidal" ? await tidalShared(link) : (await providerCollection(link)).songs[0];
    if (!song) throw new Error(t("That link has no song to show."));
    if (link.kind !== "track") return { song, match: null, problem: null };
    try {
      return { song, match: await matchOn(on.id, song), problem: null };
    } catch (e) {
      console.error("[search] couldn't look for a linked song", e);
      return { song, match: null, problem: describeError(e) };
    }
  }

  const found = resource(() => read(link, matcher));
  const play = (track: Track) => player.playTracks([track.uri], 0, [track]);
</script>

<section class="link plate" aria-busy={found.loading}>
  {#if found.error}
    <p class="quiet" role="alert">{found.error}</p>
  {:else if found.loading || !found.data}
    <p class="quiet" role="status">Reading link…</p>
  {:else}
    {@const { song, match, problem } = found.data}
    <div class="what">
      <span class="cover">
        <Icon name="note" size={28} />
        {#if song.image}<img src={song.image} alt="" width={COVER} height={COVER} decoding="async" onerror={(e) => (e.currentTarget as HTMLImageElement).remove()} />{/if}
      </span>
      <div class="text">
        <span class="from">{names[link.source]} {t(KINDS[link.kind])}</span>
        <strong class="title">{song.title}</strong>
        {#if song.artist}<span class="artist">{song.artist}</span>{/if}
        <div class="actions">
          {#if match?.selected}
            {@const track = match.selected}
            <button class="pill accent" onclick={() => play(track)}><Icon name="play" size={14} />Play on {matcher.name}</button>
          {/if}
          <button class="pill" onclick={() => onsearch(termOf(song))}><Icon name="search" size={14} />Search for it</button>
        </div>
      </div>
    </div>

    {#if link.kind !== "track"}
      <p class="quiet">{t(TIDAL_NO_SONGS)}</p>
    {:else if problem}
      <p class="quiet" role="status">{problem}</p>
    {:else if match && !match.selected && match.candidates.length}
      <h3>Closest on {matcher.name}</h3>
      <TrackList tracks={match.candidates} compact />
    {:else if match && !match.selected}
      <p class="quiet">Nothing close on {matcher.name}.</p>
    {/if}
  {/if}
</section>

<style>
  .link {
    display: grid;
    gap: var(--sp-4);
    max-width: 760px;
    margin-bottom: var(--sp-6);
    padding: var(--sp-4);
    animation: arrive var(--dur-med) var(--ease-out) backwards;
  }

  .what {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .cover {
    position: relative;
    width: 96px;
    height: 96px;
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--r-art);
    background: var(--glass);
    box-shadow: var(--shadow-art);
    color: var(--text-faint);
  }

  .cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .from {
    color: var(--text-faint);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .title {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 750;
    letter-spacing: var(--tracking-tight);
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }

  .artist {
    overflow: hidden;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }

  h3 {
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .quiet {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
