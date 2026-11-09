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
  import { specular } from "$lib/liquid";
  import { matches, textMatches } from "$lib/local/browse";
  import { localLibrary as lib } from "$lib/local/library.svelte";
  import { shuffledFrom } from "$lib/local/queue";
  import { player } from "$lib/player.svelte";
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
  <button class="back" onclick={() => nav({ album: null })}><Icon name="back" size={16} /> Local files</button>
  <DetailHeader kind="Local album" title={album.name} image={album.image}>
    {#snippet meta()}
      <span class="strong">{album?.artist}</span>
      {#if album?.year}· {album.year}{/if} · {album?.tracks.length} songs · {formatTotal(album?.tracks.reduce((s, t) => s + t.durationMs, 0) ?? 0)}
    {/snippet}
    <button class="play" onclick={() => album && playAll(album.tracks)}><Icon name="play" size={20} /> Play</button>
    <AddToCarbon tracks={album.tracks} label="Add to Carbon playlist" wide />
  </DetailHeader>
  <TrackList tracks={album.tracks} numbered showArt={false} />
{:else}
  <header class="head">
    <div class="title">
      <span class="eyebrow">On this PC</span>
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
      <label class="search glass">
        <Icon name="search" size={16} />
        <span class="sr-only">Search local files</span>
        <input type="search" placeholder="Search your files" value={query} oninput={(e) => nav({ q: e.currentTarget.value })} />
      </label>
      <button class="pill" onclick={lib.addFolder}><Icon name="folder" size={16} /> Add folder</button>
      <button class="pill" onclick={lib.rescan} disabled={lib.scanning || !lib.folders.length}>{lib.scanning ? "Scanning…" : "Rescan"}</button>
    </div>
  </header>

  {#if lib.error}<p class="warn" role="alert">{lib.error}</p>{/if}

  {#if lib.loaded && !lib.folders.length}
    <section class="empty liquid" use:specular>
      <Icon name="folder" size={40} />
      <h2>Bring your own music</h2>
      <p class="muted">Add a folder of MP3, FLAC, AAC/ALAC, Ogg Vorbis or WAV files. Carbon plays them with its own engine, EQ and gapless playback.</p>
      <button class="play" onclick={lib.addFolder}><Icon name="plus" size={18} /> Add a folder</button>
    </section>
  {:else}
    <div class="bar">
      <div class="tabs" role="tablist" aria-label="Local files sections">
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
              <span class="blank"><Icon name="lyrics" size={28} /></span>
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
              {#if a.image}<img src={a.image} alt="" width="48" height="48" loading="lazy" />{:else}<span class="blank round"></span>{/if}
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
      <h2 class="eyebrow">Folders</h2>
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
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--sp-4);
    padding: var(--sp-6) var(--sp-2) var(--sp-4);
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 750;
    line-height: 1;
    margin-top: var(--sp-2);
  }

  .muted {
    margin: var(--sp-2) 0 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .strong {
    color: var(--text);
    font-weight: 650;
  }

  .actions,
  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 38px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--text-muted);
  }

  .search:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .search input {
    width: 200px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    outline: none;
  }

  .pill,
  .back {
    height: 38px;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition: background var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
  }

  .pill:hover:not(:disabled),
  .back:hover {
    background: var(--glass-edge-top);
  }

  .pill:active:not(:disabled) {
    transform: scale(0.97);
  }

  .pill:disabled {
    opacity: 0.5;
  }

  .back {
    margin-top: var(--sp-5);
    background: none;
    border-color: transparent;
    color: var(--text-muted);
  }

  .play {
    height: 44px;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    box-shadow: 0 12px 28px -10px var(--accent-glow);
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .play:hover {
    transform: scale(1.04);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    max-width: 560px;
    margin-top: var(--sp-4);
    padding: var(--sp-6) var(--sp-5);
    border-radius: var(--r-lg);
    color: var(--accent);
  }

  .empty h2 {
    color: var(--text);
    font-size: var(--fs-title);
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
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
  }

  .tabs button.active {
    background: var(--text);
    color: var(--accent-ink);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: var(--sp-2);
  }

  .album {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition: background var(--dur-med);
  }

  .album:hover {
    background: var(--glass-hover);
  }

  .album img,
  .album .blank {
    width: 100%;
    aspect-ratio: 1;
    height: auto;
    margin-bottom: var(--sp-2);
    border-radius: var(--r-md);
    object-fit: cover;
    box-shadow: 0 14px 34px -14px rgb(0 0 0 / 0.75);
    transition: transform var(--dur-med) var(--ease-out);
  }

  .album:hover img {
    transform: translateY(-3px) scale(1.02);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    color: var(--text-faint);
  }

  .name {
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .artists {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--sp-1);
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
  }

  .artists button:hover {
    background: var(--glass-hover);
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
    margin-top: var(--sp-6);
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .folder {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .folder:hover {
    background: var(--glass-hover);
  }

  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }

  .folder button {
    padding: var(--sp-1);
    border-radius: var(--r-sm);
  }

  .folder button:hover {
    color: var(--text);
    background: var(--glass-active);
  }
</style>
