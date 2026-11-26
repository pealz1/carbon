<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import PillRow, { type Pill } from "$lib/components/PillRow.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { greeting } from "$lib/format";
  import { history } from "$lib/history/history.svelte";
  import { dailyMixes } from "$lib/history/mixes";
  import { trackOf } from "$lib/history/song";
  import MixTiles, { type Mix } from "$lib/home/MixTiles.svelte";
  import RadioRow from "$lib/home/RadioRow.svelte";
  import Recents from "$lib/home/Recents.svelte";
  import { moodsOf, similarTo, type MoodId } from "$lib/home/recommend";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import ReleasesShelf from "$lib/releases/ReleasesShelf.svelte";
  import { resource } from "$lib/resource.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { uniqueBy } from "$lib/spotify/mappers";
  import type { Card, Track } from "$lib/spotify/types";

  // Home: what you played, what is like it, stations, mixes by mood and what is new. The pills on
  // top show one shelf at a time (kept in the URL); "All" shows a row of each.
  const ON_REPEAT_COUNT = 8;
  const MOOD_HUES: Record<MoodId, number> = { sad: 255, energy: 25, chill: 195, bright: 90 };
  const REPEAT_HUE = 330;
  const FAVOURITES_HUE = 60;
  const DAILY_HUE = 285;

  const recent = resource(() => sp.recentlyPlayed());
  const top = resource(() => sp.topTracks());
  const loved = resource(() => sp.topTracks("long_term", 30));
  const artists = resource(() => sp.topArtists());
  onMount(() => void history.load());

  const albumCard = (t: Track): Card => ({
    kind: "album",
    id: t.album!.id,
    uri: t.album!.uri,
    title: t.album!.name,
    subtitle: t.artists.map((a) => a.name).join(", "),
    image: t.album!.image,
    playUri: t.album!.uri,
  });
  const trackCard = (t: Track): Card => ({ kind: "track", id: t.id, uri: t.uri, title: t.name, subtitle: t.artists.map((a) => a.name).join(", "), image: t.album?.image ?? null, playUri: t.uri });

  const playlistCards = $derived<Card[]>(
    session.playlists.map((p) => ({
      kind: "playlist",
      id: p.id,
      uri: p.uri,
      title: p.name,
      subtitle: p.ownerName ? `By ${p.ownerName}` : "Playlist",
      image: p.image,
      playUri: p.uri,
    })),
  );

  // Recently played: the playlists and artists music was played from, then the albums the songs came from.
  const recents = $derived.by<Card[]>(() => {
    const data = recent.data;
    if (!data) return [];
    const playlists = new Map(playlistCards.map((p) => [p.uri, p]));
    const orbit = new Map((artists.data ?? []).map((a) => [a.uri, a]));
    const from = data.contexts.flatMap((uri) => playlists.get(uri) ?? orbit.get(uri) ?? []);
    const albums = uniqueBy(data.tracks.filter((t) => t.album), (t) => t.album!.id).map(albumCard);
    return uniqueBy([...from, ...albums], (c) => c.uri);
  });

  // Recommendations wait until everything they must not repeat has loaded, then ask once.
  const settled = $derived(!recent.loading && !top.loading && !loved.loading);
  async function discover(seeds: Track[]): Promise<Track[]> {
    if (!seeds.length) return [];
    await Promise.all([history.load(), carbonPlaylists.load()]);
    const known = new Set([...(recent.data?.tracks ?? []), ...(top.data ?? []), ...(loved.data ?? [])].map((t) => t.id));
    for (const entry of history.entries) {
      if (entry.uri.startsWith("spotify:track:")) known.add(entry.uri.slice("spotify:track:".length));
    }
    for (const playlist of carbonPlaylists.list) {
      for (const item of playlist.items) {
        if (item.kind === "spotify") known.add(item.track.id);
      }
    }
    const candidates = await similarTo(seeds, known);
    if (!candidates.length) return [];
    const saved = await sp.isSaved(candidates.map((track) => track.uri)).catch(() => []);
    return candidates.filter((_, i) => !saved[i]);
  }
  const likeRecent = resource(() => (settled ? untrack(() => discover(recent.data?.tracks ?? [])) : Promise.resolve([])));
  const picks = resource(() => (settled ? untrack(() => discover(loved.data ?? [])) : Promise.resolve([])));
  // The two shelves are asked for separately; a song both suggest stays on the first.
  const basedCards = $derived((likeRecent.data ?? []).map(trackCard));
  const pickCards = $derived((picks.data ?? []).filter((t) => !likeRecent.data?.some((r) => r.id === t.id)).map(trackCard));
  const moods = resource(() => (settled ? untrack(() => moodsOf([...(top.data ?? []), ...(loved.data ?? []), ...(recent.data?.tracks ?? [])])) : Promise.resolve([])));

  const mixes = $derived<Mix[]>([
    ...(moods.data ?? []).map((m) => ({ id: m.id, title: m.title, tracks: m.tracks, hue: MOOD_HUES[m.id] })),
    ...(top.data && top.data.length >= ON_REPEAT_COUNT ? [{ id: "repeat", title: "On repeat", tracks: top.data, hue: REPEAT_HUE }] : []),
    ...(loved.data && loved.data.length >= ON_REPEAT_COUNT ? [{ id: "favourites", title: "All-time favourites", tracks: loved.data, hue: FAVOURITES_HUE }] : []),
    ...dailyMixes(history.entries, Date.now()).map((m) => ({ id: `daily-${m.service}`, title: m.title, tracks: m.tracks.map(trackOf), hue: DAILY_HUE })),
  ]);
  const moodMixes = $derived(mixes.filter((mix) => Object.hasOwn(MOOD_HUES, mix.id)));
  const dailyPlaylists = $derived(mixes.filter((mix) => !Object.hasOwn(MOOD_HUES, mix.id)));

  const pills = $derived<Pill[]>([
    { id: "all", label: "All" },
    ...(recents.length ? [{ id: "recent", label: "Recent" }] : []),
    ...(basedCards.length ? [{ id: "based", label: "Based on your recent music" }] : []),
    ...(artists.data?.length ? [{ id: "radio", label: "Your radio" }] : []),
    ...(pickCards.length ? [{ id: "picks", label: "We think you'll like this" }] : []),
    ...mixes.map((m) => ({ id: m.id, label: m.title })),
    { id: "new", label: "New releases" },
    ...(playlistCards.length ? [{ id: "playlists", label: "Your playlists" }] : []),
  ]);
  // A pill from an old link that no longer exists (a mood with too few songs today) falls back to All.
  const asked = $derived(page.url.searchParams.get("show") ?? "all");
  const show = $derived(pills.some((p) => p.id === asked) ? asked : "all");
  const all = $derived(show === "all");
  const openMix = $derived(mixes.find((m) => m.id === show));
  const pick = (id: string) => void goto(id === "all" ? "/" : `/?show=${encodeURIComponent(id)}`, { replace: true, reset: false });

  const firstName = $derived(prefs.value?.displayName.trim() || (session.profile?.name.split(" ")[0] ?? ""));
</script>

<header class="hero">
  <h1>{greeting(new Date())}{firstName ? `, ${firstName}` : ""}</h1>
  <a class="home-settings" href="/settings" aria-label="Settings" title="Settings"><Icon name="settings" size={19} /></a>
</header>

<PillRow {pills} current={show} label="Shelves" onpick={pick} />

{#if recent.loading && !recent.data}
  <Status loading />
{:else if recent.error}
  <Status error={recent.error} onretry={recent.reload} />
{/if}

{#if all || show === "recent"}<Recents title="Recently played" cards={recents} open={!all} />{/if}
{#if all}
  <MixTiles title="Select a mood" mixes={moodMixes} onopen={pick} mood />
  <MixTiles title="Made for you" mixes={dailyPlaylists} onopen={pick} />
{/if}
{#if all || show === "picks"}<Shelf title="We think you'll like this" cards={pickCards} feature={all} wrap={!all} />{/if}
{#if all || show === "based"}<Shelf title="Based on your recent music" cards={basedCards} wrap={!all} />{/if}
{#if all || show === "new"}<ReleasesShelf />{/if}
{#if all || show === "radio"}<RadioRow title="Your radio" artists={artists.data ?? []} wrap={!all} />{/if}

{#if all && top.data?.length}
  <section class="list">
    <h2>On repeat</h2>
    <div class="columns">
      <TrackList tracks={top.data.slice(0, ON_REPEAT_COUNT)} compact />
    </div>
  </section>
{/if}

{#if openMix}
  <section class="list">
    <header class="mix-head">
      <h2>{openMix.title}</h2>
      <button class="pill accent" onclick={() => player.playTracks(openMix.tracks.map((t) => t.uri), 0, openMix.tracks)}>Play</button>
    </header>
    <TrackList tracks={openMix.tracks} showAlbum numbered />
  </section>
{/if}

{#if all}<Shelf title="Artists in your orbit" cards={artists.data ?? []} />{/if}
{#if all || show === "playlists"}<Shelf title="Your playlists" cards={playlistCards} wrap={!all} />{/if}

<style>
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: clamp(26px, 5cqw, 48px) 0 var(--sp-4);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 800;
    line-height: 1.05;
  }

  .home-settings {
    display: grid;
    flex: none;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .home-settings:hover { color: var(--text); background: var(--glass-hover); }

  .list {
    margin-bottom: var(--sp-6);
  }

  .list h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .mix-head {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin-bottom: var(--sp-3);
  }

  .mix-head h2 {
    margin: 0;
  }

  .columns {
    margin: 0 calc(var(--sp-2) * -1);
  }

  .columns :global(ol) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sp-4);
  }

  @container stage (max-width: 820px) {
    .columns :global(ol) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
