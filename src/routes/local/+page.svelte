<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import AddToCarbon from "$lib/components/AddToCarbon.svelte";
  import DetailHeader from "$lib/components/DetailHeader.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import TrackList from "$lib/components/TrackList.svelte";
  import { formatTotal } from "$lib/format";
  import { matches, textMatches } from "$lib/local/browse";
  import { localLibrary as lib } from "$lib/local/library.svelte";
  import { shuffledFrom } from "$lib/local/queue";
  import { player } from "$lib/player.svelte";
  import { tools } from "$lib/playlist-tools/tools.svelte";
  import type { Track } from "$lib/spotify/types";

  const TABS = [
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
    { id: "songs", label: "Songs" },
  ] as const;
  type Tab = (typeof TABS)[number]["id"];

  const params = $derived(page.url.searchParams);
  const tab = $derived<Tab>(TABS.find((t) => t.id === params.get("tab"))?.id ?? "albums");
  const query = $derived(params.get("q") ?? "");
  const album = $derived(lib.albums.find((a) => a.key === params.get("album")) ?? null);
  const artist = $derived(params.get("artist"));
  const songs = $derived<Track[]>(
    lib.tracks.filter((t) => matches(t, query) && (!artist || t.artists.some((a) => a.name === artist))),
  );
  const albums = $derived(query ? lib.albums.filter((a) => a.tracks.some((t) => matches(t, query))) : lib.albums);
  const artists = $derived(lib.artists.filter((a) => textMatches(a.name, query)));

  onMount(() => void lib.load());

  function nav(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    void goto(`?${next}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  const playAll = (tracks: Track[], shuffle = false) => {
    if (!tracks.length) return;
    void player.playQueue(shuffle ? shuffledFrom(tracks, Math.floor(Math.random() * tracks.length)) : tracks);
  };
</script>

{#if album}
  {@const a = album}
  <button class="back" onclick={() => nav({ album: null })}><Icon name="back" size={16} /> Local files</button>
  <DetailHeader
    title={a.name}
    image={a.image}
    placeholder="album"
    onplay={() => playAll(a.tracks)}
    onshuffle={() => playAll(a.tracks, true)}
    chips={[
      { label: "Local album", icon: "folder" },
      ...(a.year ? [{ label: String(a.year), icon: "calendar" as const }] : []),
      { label: `${a.tracks.length} ${a.tracks.length === 1 ? "song" : "songs"}`, icon: "note" },
      { label: formatTotal(a.tracks.reduce((s, t) => s + t.durationMs, 0)), icon: "clock" },
    ]}
  >
    {#snippet byline()}
      <button class="person" onclick={() => nav({ album: null, artist: a.artist })}><span class="avatar"><Icon name="artist" size={15} /></span>{a.artist}</button>
    {/snippet}
    <AddToCarbon tracks={a.tracks} label="Add to Carbon playlist" wide />
  </DetailHeader>
  <TrackList tracks={album.tracks} numbered showArt={false} />
{:else}
  <header class="page-head">
    <div class="title">
      {#if artist}<button class="back" onclick={() => nav({ artist: null })}><Icon name="back" size={16} /> Local files</button>{/if}
      <h1>{artist ?? "Local files"}</h1>
      <p class="muted">
        {#if lib.scanning}
          Scanning{lib.progress ? ` · ${lib.progress.done} of ${lib.progress.total} files` : "…"}
        {:else}
          {lib.tracks.length} songs · {lib.albums.length} albums
        {/if}
      </p>
    </div>
    <div class="actions">
      <label class="search">
        <Icon name="search" size={16} />
        <span class="sr-only">Search local files</span>
        <input type="search" placeholder="Search your files" value={query} oninput={(e) => nav({ q: e.currentTarget.value })} />
      </label>
      <button class="pill" onclick={lib.addFolder}><Icon name="folder" size={16} /> Add folder</button>
      <button class="pill" onclick={lib.rescan} disabled={lib.scanning || !lib.folders.length}>{lib.scanning ? "Scanning…" : "Rescan"}</button>
      <button class="pill" onclick={tools.openImport}><Icon name="import" size={16} /> Import playlist</button>
    </div>
  </header>

  {#if lib.error}<p class="warn" role="alert">{lib.error}</p>{/if}

  {#if lib.loaded && !lib.folders.length}
    <section class="empty plate">
      <Icon name="folder" size={40} />
      <h2>Bring your own music</h2>
      <p class="muted">Add a folder of MP3, FLAC, AAC/ALAC, Ogg Vorbis or WAV files. Carbon plays them with its own engine, EQ and gapless playback.</p>
      <button class="pill accent" onclick={lib.addFolder}><Icon name="plus" size={16} /> Add a folder</button>
    </section>
  {:else}
    <div class="bar">
      <div class="segmented" role="tablist" aria-label="Local files sections">
        {#each TABS as t (t.id)}
          <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => nav({ tab: t.id, artist: null })}>{t.label}</button>
        {/each}
      </div>
      {#if tab === "songs" || artist}
        <div class="row-actions">
          <button class="pill" onclick={() => playAll(songs)} disabled={!songs.length}><Icon name="play" size={14} /> Play</button>
          <button class="pill" onclick={() => playAll(songs, true)} disabled={!songs.length}><Icon name="shuffle" size={14} /> Shuffle</button>
        </div>
      {/if}
    </div>

    {#if !lib.loaded}
      <Status loading />
    {:else if tab === "albums" && !artist}
      <div class="grid">
        {#each albums as a (a.key)}
          <button class="album" onclick={() => nav({ album: a.key })}>
            {#if a.image}
              <img src={a.image} alt="" width="200" height="200" loading="lazy" decoding="async" />
            {:else}
              <span class="blank"><Icon name="note" size={28} /></span>
            {/if}
            <span class="name">{a.name}</span>
            <span class="sub">{a.artist}{a.year ? ` · ${a.year}` : ""}</span>
          </button>
        {/each}
      </div>
      <Status empty={albums.length ? null : "No albums match."} />
    {:else if tab === "artists" && !artist}
      <ul class="artists">
        {#each artists as a (a.name)}
          <li>
            <button onclick={() => nav({ artist: a.name })}>
              {#if a.image}<img src={a.image} alt="" width="48" height="48" loading="lazy" />{:else}<span class="blank round"><Icon name="artist" size={20} /></span>{/if}
              <span class="name">{a.name}</span>
              <span class="sub">{a.songs} {a.songs === 1 ? "song" : "songs"}</span>
            </button>
          </li>
        {/each}
      </ul>
      <Status empty={artists.length ? null : "No artists match."} />
    {:else}
      <TrackList tracks={songs} showAlbum />
      <Status empty={songs.length ? null : "No songs match."} />
    {/if}

    <section class="folders">
      <h2>Folders</h2>
      {#each lib.folders as folder (folder)}
        <div class="folder">
          <Icon name="folder" size={16} />
          <span class="path" title={folder}>{folder}</span>
          <button onclick={() => lib.removeFolder(folder)} aria-label="Stop watching {folder}" title="Remove folder"><Icon name="close" size={14} /></button>
        </div>
      {/each}
    </section>
  {/if}
{/if}

<style>
  .page-head {
    justify-content: space-between;
  }

  .title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions,
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 36px;
    width: 240px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .search:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font: inherit;
    user-select: text;
  }

  .search input::placeholder {
    color: var(--text-faint);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 28px;
    margin-left: calc(var(--sp-2) * -1);
    padding: 0 var(--sp-3) 0 var(--sp-1);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .back:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  :global(main) > .back {
    margin-top: var(--sp-4);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    max-width: 620px;
    padding: var(--sp-5);
    color: var(--text-muted);
  }

  .empty h2 {
    color: var(--text);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }

  .album {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    border-radius: var(--r-lg);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    /* Holds still when pressed: the cover never scales. */
    --press: 1;
  }

  .album:hover {
    background: var(--glass-hover);
  }

  .album:active {
    background: var(--glass-active);
  }

  .album img,
  .album .blank {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    margin-bottom: var(--sp-2);
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: 0 12px 30px -16px rgb(0 0 0 / 0.9);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--graphite-800);
    color: var(--text-faint);
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .artists {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--sp-1);
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
    list-style: none;
  }

  .artists button {
    width: 100%;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    /* Holds still when pressed: the cover never scales. */
    --press: 1;
  }

  .artists button:hover {
    background: var(--glass-hover);
  }

  .artists button:active {
    background: var(--glass-active);
  }

  .artists img,
  .artists .blank {
    grid-row: span 2;
    width: 48px;
    height: 48px;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .folders {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--sp-6);
  }

  .folders h2 {
    margin-bottom: var(--sp-2);
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0;
  }

  .folder {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 40px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--text-muted);
    transition: background var(--dur-fast);
  }

  .folder:hover {
    background: var(--glass-hover);
  }

  .path {
    flex: 1;
    min-width: 0;
    color: var(--text);
    font-size: var(--fs-small);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: text;
  }

  .folder button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .folder button:hover {
    background: var(--glass-active);
    color: var(--text);
  }
</style>
