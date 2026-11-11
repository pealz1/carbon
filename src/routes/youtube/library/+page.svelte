<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import type { Card } from "$lib/spotify/types";
  import * as api from "$lib/youtube/api";
  import { youtube } from "$lib/youtube/session.svelte";

  // Your YouTube Music library (signed in), laid out like Carbon's Spotify library.
  const TABS = [
    { id: "playlists", label: "Playlists", load: api.libraryPlaylists },
    { id: "albums", label: "Albums", load: api.libraryAlbums },
    { id: "artists", label: "Artists", load: api.libraryArtists },
  ] as const;
  type Tab = (typeof TABS)[number]["id"];
  const tab = $derived<Tab>(TABS.find((t) => t.id === page.url.searchParams.get("tab"))?.id ?? "playlists");

  const items = resource<Card[]>(() => {
    const current = TABS.find((t) => t.id === tab)!;
    return youtube.signedIn ? current.load() : Promise.resolve([]);
  });
  // Liked Music has its own tile, so it's left out of the grid.
  const cards = $derived((items.data ?? []).filter((c) => c.id !== api.LIKED_PLAYLIST));
</script>

<header class="page-head">
  <h1>Library</h1>
  {#if youtube.signedIn}
    <button class="pill new" onclick={() => (youtube.dialog = { mode: "create", videoIds: [] })}><Icon name="plus" size={16} />New playlist</button>
    <div class="segmented" role="tablist" aria-label="Library sections">
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => goto(`?tab=${t.id}`, { replaceState: true, noScroll: true })}>
          {t.label}
        </button>
      {/each}
    </div>
  {/if}
</header>

{#if !youtube.signedIn}
  <div class="signin plate">
    <p>Sign in to YouTube Music to see your playlists, albums and artists here. Browsing and playing work without it.</p>
    <a class="pill accent" href="/settings">Open Settings</a>
  </div>
{:else}
  <div class="grid">
    {#if tab === "playlists"}
      <a href="/youtube/playlist/{api.LIKED_PLAYLIST}" class="liked pressable">
        <Icon name="heart" size={30} filled />
        <span class="liked-title">Liked Music</span>
        <span class="liked-sub">Everything you've liked on YouTube Music</span>
      </a>
    {/if}
    {#each cards as card (card.id)}
      <MediaCard {card} />
    {/each}
  </div>
  {#if items.loading && !items.data}
    <Status loading />
  {:else if items.error}
    <Status error={items.error} onretry={items.reload} />
  {:else if !cards.length && tab !== "playlists"}
    <Status empty={tab === "albums" ? "Albums you save on YouTube Music show up here." : "Artists you subscribe to show up here."} />
  {/if}
{/if}

<style>
  .new {
    margin-left: auto;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }

  /* Liked Music is Carbon's own tile, matching Liked Songs: a graphite plate with the yellow heart. */
  .liked {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--sp-1);
    min-height: 220px;
    margin: var(--sp-2);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
    color: var(--accent);
    background: radial-gradient(90% 120% at 20% 0%, var(--graphite-700), var(--graphite-900));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
    text-decoration: none;
  }

  .liked:hover {
    text-decoration: none;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      inset 0 0 0 100vmax rgb(255 255 255 / 0.04);
  }

  .liked-title {
    margin-top: auto;
    color: var(--text);
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: var(--tracking-tight);
  }

  .liked-sub {
    color: var(--text-muted);
    font-weight: 600;
  }

  .signin {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    max-width: 68ch;
    padding: var(--sp-4) var(--sp-5);
    color: var(--text-muted);
  }

  .signin p {
    margin: 0;
    line-height: 1.5;
  }

  .signin .pill {
    flex: none;
    align-self: center;
  }
</style>
