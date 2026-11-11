<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import LoadMore from "$lib/components/LoadMore.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Status from "$lib/components/Status.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { allTags, hasTag } from "$lib/organizer";
  import { organizer } from "$lib/organizer.svelte";
  import { Pager } from "$lib/pager.svelte";
  import { tools } from "$lib/playlist-tools/tools.svelte";
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

  const tags = $derived(allTags(organizer.data));
  const tag = $derived(page.url.searchParams.get("tag"));
  // Pinned first (in pin order), then the rest as Spotify lists them; filtered by the chosen tag.
  const playlists = $derived.by(() => {
    const pins = organizer.data.pins;
    const pinned = pins.map((id) => session.playlists.find((p) => p.id === id)).filter((p) => !!p);
    const ordered = [...pinned, ...session.playlists.filter((p) => !pins.includes(p.id))];
    return tag ? ordered.filter((p) => hasTag(organizer.data, p.id, tag)) : ordered;
  });

  const setTag = (next: string | null) =>
    goto(next ? `?tab=playlists&tag=${encodeURIComponent(next)}` : "?tab=playlists", { replaceState: true, noScroll: true, keepFocus: true });

  const playlistCards = $derived<Card[]>(
    playlists.map((p) => ({
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

<header class="page-head">
  <h1>Library</h1>
  <button class="pill new" onclick={() => (dialogs.playlist = { mode: "create" })}><Icon name="plus" size={16} />New playlist</button>
  <button class="pill" onclick={tools.openImport}><Icon name="import" size={16} />Import</button>
  <div class="segmented" role="tablist" aria-label="Library sections">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => goto(`?tab=${t.id}`, { replaceState: true, noScroll: true })}>
        {t.label}
      </button>
    {/each}
  </div>
</header>

{#if tab === "playlists" && tags.length}
  <div class="filters" role="group" aria-label="Filter by tag">
    <button class:active={!tag} aria-pressed={!tag} onclick={() => setTag(null)}>All</button>
    {#each tags as t (t)}
      <button class:active={tag?.toLowerCase() === t.toLowerCase()} aria-pressed={tag?.toLowerCase() === t.toLowerCase()} onclick={() => setTag(t)}>
        <Icon name="tag" size={13} />{t}
      </button>
    {/each}
  </div>
{/if}

<div class="grid">
  {#if tab === "playlists"}
    {#if !tag}
      <a href="/liked" class="liked pressable">
        <Icon name="heart" size={30} filled />
        <span class="liked-title">Liked Songs</span>
        <span class="liked-sub">Everything you've hearted</span>
      </a>
    {/if}
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

{#if tab === "playlists" && tag && !playlistCards.length}
  <Status empty={`No playlists tagged “${tag}”.`} />
{:else if tab === "albums"}
  {#if albums.done && !albums.items.length}<Status empty="Albums you save will show up here." />{/if}
  <LoadMore pager={albums} />
{:else if tab === "artists"}
  <Status loading={artists.loading} error={artists.error} empty={artists.data?.length === 0 ? "Artists you follow will show up here." : null} onretry={artists.reload} />
{/if}

<style>
  .new {
    margin-left: auto;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: calc(var(--sp-3) * -1) 0 var(--sp-4);
  }

  .filters button {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    height: 30px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .filters button:hover {
    color: var(--text);
  }

  .filters button.active {
    background: var(--paper);
    box-shadow: none;
    color: var(--ink);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }

  /* Liked Songs is Carbon's own tile: a graphite plate with the yellow heart, like its page. */
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
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
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
</style>
