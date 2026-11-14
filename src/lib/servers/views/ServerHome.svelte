<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { resource } from "$lib/resource.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";

  // A server's front page: what was added lately, what gets played, a random pick and its playlists,
  // with a search box that takes the page over. The search lives in the address, so Back returns to it.
  let { library, kind }: { library: ServerLibrary; kind: ServerKind } = $props();
  const DEBOUNCE_MS = 320;
  const initial = page.url.searchParams.get("q") ?? "";
  let query = $state(initial);
  let term = $state(initial.trim());

  $effect(() => {
    const next = query.trim();
    const timer = setTimeout(() => {
      if (next === term) return;
      term = next;
      void goto(next ? `?q=${encodeURIComponent(next)}` : "?", { replaceState: true, keepFocus: true, noScroll: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const home = resource(() => library.home());
  const playlists = resource(() => library.playlists());
  const found = resource(() => (term ? library.search(term) : Promise.resolve(null)));
</script>

<header class="page-head">
  <h1>{SERVER_NAMES[kind]}</h1>
  <a class="pill" href="/server/{kind}/artists"><Icon name="artist" size={15} />All artists</a>
</header>
<div class="field">
  <Icon name="search" size={20} />
  <input bind:value={query} placeholder="Search your server" aria-label="Search {SERVER_NAMES[kind]}" spellcheck="false" />
</div>

{#if term}
  {#if found.loading && !found.data}
    <Status loading />
  {:else if found.error}
    <Status error={found.error} onretry={found.reload} />
  {:else if found.data}
    {@const r = found.data}
    {#if r.tracks.length}
      <section>
        <h2>Songs</h2>
        <TrackList tracks={r.tracks} showAlbum />
      </section>
    {/if}
    <Shelf title="Albums" cards={r.albums} />
    <Shelf title="Artists" cards={r.artists} />
    {#if !r.tracks.length && !r.albums.length && !r.artists.length}
      <Status empty={`Nothing on your server matches “${term}”.`} />
    {/if}
  {/if}
{:else}
  {#if home.loading && !home.data}
    <Status loading />
  {:else if home.error}
    <Status error={home.error} onretry={home.reload} />
  {:else}
    {#each home.data ?? [] as shelf, i (shelf.title)}
      <Shelf title={shelf.title} cards={shelf.cards} feature={i === 0} />
    {:else}
      <Status empty="This server has no albums yet." />
    {/each}
  {/if}
  <Shelf title="Playlists" cards={playlists.data ?? []} />
{/if}

<style>
  .page-head {
    align-items: center;
    justify-content: space-between;
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 48px;
    max-width: 520px;
    margin-bottom: var(--sp-6);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .field:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  input {
    flex: 1;
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }

  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }
</style>
