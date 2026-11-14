<script lang="ts">
  import { page } from "$app/state";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import * as soundcloud from "$lib/soundcloud/api";
  import SearchBox from "$lib/soundcloud/shared/SearchBox.svelte";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";

  // SoundCloud's front page: search first, with SoundCloud's own picks and what is trending beneath.
  let term = $state((page.url.searchParams.get("q") ?? "").trim());
  const home = resource(() => soundcloud.home());
  const found = resource(() => (term ? soundcloud.search(term) : Promise.resolve(null)));
</script>

<header class="page-head"><h1>SoundCloud</h1></header>
<SearchBox bind:term placeholder="Search songs, playlists and people" label="Search SoundCloud" />

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
        <SongList listed={r.tracks} service="SoundCloud" />
      </section>
    {/if}
    <Shelf title="Playlists and albums" cards={r.playlists} />
    <Shelf title="People" cards={r.users} />
    {#if !r.tracks.length && !r.playlists.length && !r.users.length}
      <Status empty={`Nothing on SoundCloud matches “${term}”.`} />
    {/if}
  {/if}
{:else if home.loading && !home.data}
  <Status loading />
{:else if home.error}
  <Status error={home.error} onretry={home.reload} />
{:else if home.data}
  {@const h = home.data}
  {#each h.shelves as shelf, i (shelf.title)}
    <Shelf title={shelf.title} cards={shelf.cards} feature={i === 0} />
  {/each}
  {#if h.trending.length}
    <section>
      <h2>Trending now</h2>
      <SongList listed={h.trending} service="SoundCloud" />
    </section>
  {/if}
  {#if !h.shelves.length && !h.trending.length}
    <Status empty="SoundCloud isn't sharing its front page right now. Search still works." />
  {/if}
{/if}

<style>
  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }
</style>
