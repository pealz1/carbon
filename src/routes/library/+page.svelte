<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Status from "$lib/components/Status.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { resource } from "$lib/resource.svelte";
  import { session } from "$lib/session.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import type { Card } from "$lib/spotify/types";

  const TABS = [
    { id: "playlists", label: "Playlists" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
  ] as const;
  type Tab = (typeof TABS)[number]["id"];

  const tab = $derived<Tab>(TABS.find((t) => t.id === page.url.searchParams.get("tab"))?.id ?? "playlists");
  const albums = new Pager<Card>((offset) => sp.savedAlbums(offset));
  const artists = resource(() => (tab === "artists" ? sp.followedArtists() : Promise.resolve(null)));

  const playlistCards = $derived<Card[]>(
    session.playlists.map((p) => ({
      kind: "playlist",
      id: p.id,
      uri: p.uri,
      title: p.name,
      subtitle: [p.ownerName && `By ${p.ownerName}`, p.trackCount !== null && `${p.trackCount} songs`].filter(Boolean).join(" · "),
      image: p.image,
      playUri: p.uri,
    })),
  );
</script>

<header class="head">
  <h1>Library</h1>
  <div class="tabs" role="tablist" aria-label="Library sections">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => goto(`?tab=${t.id}`, { replaceState: true, noScroll: true })}>
        {t.label}
      </button>
    {/each}
  </div>
</header>

<div class="grid">
  {#if tab === "playlists"}
    <a href="/liked" class="liked">
      <Icon name="heart" size={34} filled />
      <span class="liked-title">Liked Songs</span>
      <span class="liked-sub">Everything you've hearted</span>
    </a>
    {#each playlistCards as card (card.id)}
      <MediaCard {card} />
    {/each}
  {:else if tab === "albums"}
    {#each albums.items as card (card.id)}
      <MediaCard {card} />
    {/each}
  {:else if artists.data}
    {#each artists.data as card (card.id)}
      <MediaCard {card} />
    {/each}
  {/if}
</div>

{#if tab === "albums"}
  {#if albums.done && !albums.items.length}<Status empty="Albums you save will show up here." />{/if}
  <LoadMore pager={albums} />
{:else if tab === "artists"}
  <Status loading={artists.loading} error={artists.error} empty={artists.data?.length === 0 ? "Artists you follow will show up here." : null} onretry={artists.reload} />
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-6) var(--sp-2) var(--sp-5);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 750;
    line-height: 1;
  }

  .tabs {
    display: flex;
    gap: var(--sp-1);
    padding: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
  }

  .tabs button {
    height: 34px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-weight: 600;
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .tabs button:hover {
    color: var(--text);
  }

  .tabs button.active {
    background: var(--text);
    color: var(--accent-ink);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    gap: var(--sp-2);
  }

  .liked {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--sp-1);
    min-height: 220px;
    padding: var(--sp-5);
    border-radius: var(--r-lg);
    color: var(--accent-ink);
    background: linear-gradient(140deg, var(--accent) 0%, var(--accent-strong) 60%, var(--accent-deep) 100%);
    box-shadow: var(--shadow-art);
    text-decoration: none;
    transition: transform var(--dur-med) var(--ease-out);
  }

  .liked:hover {
    transform: translateY(-3px);
    text-decoration: none;
  }

  .liked-title {
    font-family: var(--font-display);
    font-size: 1.9rem;
    font-weight: 750;
    letter-spacing: var(--tracking-tight);
  }

  .liked-sub {
    font-weight: 600;
    opacity: 0.75;
  }
</style>
