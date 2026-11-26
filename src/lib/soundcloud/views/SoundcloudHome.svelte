<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Shelf from "$lib/components/Shelf.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeError } from "$lib/errors";
  import { openPlayer } from "$lib/providers/catalog";
  import { resource } from "$lib/resource.svelte";
  import * as soundcloud from "$lib/soundcloud/api";
  import SearchBox from "$lib/soundcloud/shared/SearchBox.svelte";
  import SongList from "$lib/soundcloud/shared/SongList.svelte";

  // Search and account library use the same SoundCloud sign-in.
  let term = $state((page.url.searchParams.get("q") ?? "").trim());
  let name = $state("");
  let creating = $state(false);
  let createError = $state<string | null>(null);
  const linked = resource(soundcloud.connection);
  const library = resource(() => linked.data?.soundcloudUser ? soundcloud.library() : Promise.resolve(null));
  const found = resource(() => term && linked.data?.soundcloud ? soundcloud.search(term) : Promise.resolve(null));

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (creating || !name.trim()) return;
    creating = true;
    createError = null;
    try {
      const playlist = await soundcloud.changePlaylist({ kind: "create", title: name });
      await goto(`/soundcloud/playlist/${playlist.id}`);
    } catch (error) {
      createError = describeError(error);
    } finally {
      creating = false;
    }
  }

  async function openSearch() {
    try {
      await openPlayer("soundcloud", "https://soundcloud.com/search?" + new URLSearchParams({ q: term }));
    } catch (error) {
      createError = describeError(error);
    }
  }
</script>

<header class="page-head">
  <h1>SoundCloud</h1>
  <a class="pill" href="/soundcloud/account">SoundCloud player and account</a>
</header>
<SearchBox bind:term placeholder="Search songs, playlists and people" label="Search SoundCloud" />

{#if linked.loading && !linked.data}
  <Status loading />
{:else if linked.error}
  <Status error={linked.error} onretry={linked.reload} />
{:else if term}
  {#if !linked.data?.soundcloud}
    <p class="hint">Connect a SoundCloud API app to search inside Carbon.</p>
    <button class="pill" onclick={openSearch}>Open in SoundCloud</button>
    {#if createError}<Status error={createError} />{/if}
  {:else}
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
  {/if}
{:else if !linked.data?.soundcloudUser}
  <p class="hint">Sign in to SoundCloud to see your playlists, likes and recent plays.</p>
{:else if library.loading && !library.data}
  <Status loading />
{:else if library.error}
  <Status error={library.error} onretry={library.reload} />
{:else if library.data}
  {@const h = library.data}
  <section aria-label="Your playlists">
    <form class="create" onsubmit={create}>
      <input class="input" aria-label="Playlist name" placeholder="Playlist name" bind:value={name} maxlength="200" />
      <button class="pill" type="submit" disabled={creating || !name.trim()}>Create playlist</button>
    </form>
    {#if createError}<Status error={createError} />{/if}
    <Shelf title="Your playlists" cards={h.playlists} />
  </section>
  <Shelf title="Liked playlists" cards={h.likedPlaylists} />
  {#if h.liked.length}
    <section>
      <h2>Liked Songs</h2>
      <SongList listed={h.liked} service="SoundCloud" />
    </section>
  {/if}
  {#if h.recent.length}
    <section>
      <h2>Recently played</h2>
      <SongList listed={h.recent} service="SoundCloud" />
    </section>
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

  .create {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-bottom: var(--sp-3);
  }

  .hint { color: var(--text-muted); margin: 0 0 var(--sp-3); }
</style>
