<script lang="ts">
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { parseProviderLink } from "$lib/providers/catalog";
  import * as tidal from "$lib/tidal/api";
  import type { Operation, Page, Row } from "$lib/tidal/api";

  const empty = (): Page => ({ rows: [], cursor: null });
  const label = (kind: Row["kind"]) => t(({ track: "Song", album: "Album", artist: "Artist", playlist: "Playlist" })[kind]);
  let connected = $state(false);
  let ready = $state(false);
  let busy = $state(false);
  let error = $state("");
  let status = $state("");
  let clientId = $state("");
  let query = $state("");
  let name = $state("");
  let view = $state<Operation | null>(null);
  let results = $state<Page>(empty());
  let selected = $state<Row | null>(null);
  let preview = $state<Row | null>(null);
  const playing = $derived(preview ?? selected);
  let tracks = $state<Page>(empty());
  let owned = $state<Page>(empty());
  let chooser = $state<Row | null>(null);
  let destination = $state("");

  onMount(() => {
    void tidal.connected()
      .then((value) => { connected = value; })
      .catch((failure) => { error = describeError(failure); })
      .finally(() => { ready = true; });
  });

  async function run(task: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = "";
    status = "";
    try {
      await task();
    } catch (failure) {
      error = describeError(failure);
    } finally {
      busy = false;
    }
  }

  function load(operation: Operation) {
    return run(async () => {
      const answer = await tidal.read(operation);
      view = operation;
      results = answer;
      selected = null;
      preview = null;
      chooser = null;
    });
  }

  async function loadMore(current: Page, operation: Operation) {
    if (!current.cursor) return;
    const next = await tidal.read(operation, current.cursor);
    return { rows: [...current.rows, ...next.rows], cursor: next.cursor === current.cursor ? null : next.cursor };
  }

  function items(row: Row): Operation {
    if (row.kind === "album") return { kind: "albumTracks", id: row.id };
    if (row.kind === "artist") return { kind: "artistAlbums", id: row.id };
    return { kind: "playlistTracks", id: row.id };
  }

  function choose(row: Row) {
    return run(async () => {
      selected = row;
      preview = null;
      chooser = null;
      tracks = empty();
      if (connected && row.kind !== "track") tracks = await tidal.read(items(row));
    });
  }

  function search() {
    const term = query.trim();
    const link = parseProviderLink(term);
    if (link?.source === "tidal" && (link.kind === "track" || link.kind === "album" || link.kind === "playlist") && tidal.validId(link.kind, link.id)) {
      void choose({ kind: link.kind, id: link.id, title: "TIDAL", artist: "", image: null, itemId: null });
    } else if (term && connected) {
      void load({ kind: "search", query: term });
    } else if (term) error = t("Paste a TIDAL link or connect your account to search.");
  }

  function startAdd(row: Row) {
    return run(async () => {
      owned = await tidal.read({ kind: "ownedPlaylists" });
      destination = owned.rows[0]?.id ?? "";
      chooser = row;
    });
  }

  function add() {
    return run(async () => {
      if (!chooser || !destination) return;
      await tidal.editPlaylistTrack(destination, chooser.id);
      chooser = null;
      status = t("Added");
      // A search result or saved track can also be added to the open playlist.
      if (selected?.kind === "playlist" && selected.id === destination) {
        tracks = await tidal.read(items(selected));
      }
    });
  }

  const editable = $derived(view?.kind === "ownedPlaylists" && selected?.kind === "playlist" &&
    results.rows.some((row) => row.id === selected?.id));
</script>

<section class="tidal">
  <header class="page-head">
    <h1 class="logo">
      <img class="white" src="/tidal-logo-white.png" alt="TIDAL" width="106" />
      <img class="black" src="/tidal-logo-black.png" alt="TIDAL" width="106" />
    </h1>
    <button class="pill" onclick={() => run(() => openUrl("https://tidal.com/"))}>Open in TIDAL</button>
  </header>

  {#if ready && !connected}
    <details class="connect">
      <summary>Connect TIDAL</summary>
      <p>Register an app in the TIDAL Developer Portal and add this redirect URI.</p>
      <code>{tidal.REDIRECT_URI}</code>
      <button class="link" onclick={() => run(() => openUrl(tidal.DEVELOPER_PORTAL))}>TIDAL Developer Portal</button>
      <form onsubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await tidal.connect(clientId.trim());
          clientId = "";
          connected = true;
        });
      }}>
        <label for="tidal-client">Client ID</label>
        <div class="actions">
          <input class="input" id="tidal-client" bind:value={clientId} maxlength="128" autocomplete="off" />
          <button class="pill accent" disabled={busy || !clientId.trim()}>Connect TIDAL</button>
        </div>
      </form>
    </details>
  {/if}

  <form aria-label="Search TIDAL" onsubmit={(event) => { event.preventDefault(); search(); }}>
    <label for="tidal-search">Search TIDAL or paste a link</label>
    <div class="actions">
      <input class="input" id="tidal-search" bind:value={query} maxlength="2048" />
      <button class="pill accent" disabled={!ready || busy || !query.trim()}>Search</button>
    </div>
  </form>

  {#if connected}
    <div class="actions library">
      <button class="pill" class:accent={view?.kind === "ownedPlaylists"} disabled={busy} onclick={() => load({ kind: "ownedPlaylists" })}>Your playlists</button>
      <button class="pill" class:accent={view?.kind === "savedPlaylists"} disabled={busy} onclick={() => load({ kind: "savedPlaylists" })}>Saved playlists</button>
      <button class="pill" class:accent={view?.kind === "savedTracks"} disabled={busy} onclick={() => load({ kind: "savedTracks" })}>Saved songs</button>
      <button class="pill disconnect" disabled={busy} onclick={() => run(async () => {
        await tidal.disconnect();
        connected = false;
        results = empty();
        tracks = empty();
        selected = null;
        preview = null;
        chooser = null;
        owned = empty();
        view = null;
      })}>Disconnect</button>
    </div>
  {/if}

  {#if busy}<p role="status">Loading…</p>{/if}
  {#if error}<p class="problem" role="alert">{error}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}

  {#if view?.kind === "ownedPlaylists"}
    <form onsubmit={(event) => {
      event.preventDefault();
      void run(async () => {
        const created = await tidal.createPlaylist(name);
        name = "";
        status = t("Playlist created");
        if (created && results.rows.every((row) => row.id !== created.id)) {
          results = { ...results, rows: [created, ...results.rows] };
        } else results = await tidal.read({ kind: "ownedPlaylists" });
      });
    }}>
      <label for="tidal-playlist-name">Playlist name</label>
      <div class="actions">
        <input class="input" id="tidal-playlist-name" bind:value={name} maxlength="250" />
        <button class="pill" disabled={busy || !name.trim()}>Create playlist</button>
      </div>
    </form>
  {/if}

  {#if selected && playing}
    <section class="selection">
      <header class="page-head">
        <h2>{selected.title}</h2>
        <div class="actions">
          {#if connected && playing.kind === "track"}
            <button class="pill" disabled={busy} onclick={() => playing && startAdd(playing)}>Add to playlist</button>
          {/if}
          <button class="pill" disabled={busy} onclick={() => {
            const item = playing;
            if (item) void run(() => openUrl(tidal.shareUrl(item)));
          }}>Open in TIDAL</button>
          <button class="pill" disabled={busy} onclick={() => { selected = null; preview = null; chooser = null; tracks = empty(); }}>Close player</button>
        </div>
      </header>
      {#if playing.kind !== "artist"}
        {#key playing.kind + playing.id}
          <iframe title={t("TIDAL player")} src={tidal.playerUrl(playing)} height={playing.kind === "track" ? 180 : 380}
            allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer"></iframe>
        {/key}
      {/if}
      {#if tracks.rows.length}
        <ul>
          {#each tracks.rows as track}
            <li>
              {@render result(track, () => {
                if (track.kind !== "track") { void choose(track); return; }
                preview = track;
                chooser = null;
              })}
              {#if editable && track.itemId}
                <button class="pill" disabled={busy} onclick={() => run(async () => {
                  if (!selected) return;
                  await tidal.editPlaylistTrack(selected.id, track.id, track.itemId);
                  tracks = { ...tracks, rows: tracks.rows.filter((row) => row.itemId !== track.itemId) };
                  if (preview?.itemId === track.itemId) { preview = null; chooser = null; }
                })}>Remove from playlist</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if tracks.cursor}
        <button class="pill" disabled={busy} onclick={() => run(async () => {
          if (selected) tracks = (await loadMore(tracks, items(selected))) ?? tracks;
        })}>Load more</button>
      {/if}
    </section>
  {/if}

  {#if chooser}
    <form class="chooser" onsubmit={(event) => { event.preventDefault(); void add(); }}>
      <label for="tidal-destination">{chooser.title}</label>
      {#if owned.rows.length}
        <div class="actions">
          <select class="input" id="tidal-destination" bind:value={destination}>
            {#each owned.rows as playlist (playlist.id)}<option value={playlist.id}>{playlist.title}</option>{/each}
          </select>
          <button class="pill accent" disabled={busy || !destination}>Add to playlist</button>
          {#if owned.cursor}
            <button type="button" class="pill" disabled={busy} onclick={() => run(async () => {
              owned = (await loadMore(owned, { kind: "ownedPlaylists" })) ?? owned;
            })}>Load more</button>
          {/if}
          <button type="button" class="pill" disabled={busy} onclick={() => { chooser = null; }}>Cancel</button>
        </div>
      {:else}
        <p>No results.</p>
        <button type="button" class="pill" disabled={busy} onclick={() => load({ kind: "ownedPlaylists" })}>Create playlist</button>
      {/if}
    </form>
  {/if}

  {#if results.rows.length}
    <ul>
      {#each results.rows as row}
        <li>{@render result(row, () => choose(row))}</li>
      {/each}
    </ul>
  {:else if view && !busy}
    <p>No results.</p>
  {/if}
  {#if results.cursor}
    <button class="pill" disabled={busy} onclick={() => run(async () => {
      if (view) results = (await loadMore(results, view)) ?? results;
    })}>Load more</button>
  {/if}
</section>

{#snippet result(row: Row, onchoose: () => void)}
  <button class="row" disabled={busy} onclick={onchoose}>
    <span class="art">
      {#if row.image}<img src={row.image} alt="" loading="lazy" />{:else}<Icon name="note" size={18} />{/if}
    </span>
    <span class="labels"><strong>{row.title}</strong><small>{row.artist || label(row.kind)}</small></span>
    <Icon name={row.kind === "track" ? "play" : "forward"} size={16} />
  </button>
{/snippet}

<style>
  .tidal, form, .selection { display: grid; gap: var(--sp-3); }
  .tidal { gap: var(--sp-5); }
  .page-head, .actions, li { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
  .page-head { justify-content: space-between; }
  .logo img { display: block; height: auto; }
  .logo .black, :global([data-theme="light"]) .logo .white { display: none; }
  :global([data-theme="light"]) .logo .black { display: block; }
  .connect, .selection, .chooser { padding: var(--sp-4); border: 1px solid var(--glass-edge); border-radius: var(--r-lg); }
  .connect > * + * { margin-top: var(--sp-2); }
  .connect summary { cursor: pointer; font-weight: 700; }
  .connect code { display: inline-block; overflow-wrap: anywhere; }
  .connect .link { margin-inline-start: var(--sp-3); color: var(--accent); text-decoration: underline; }
  .input { flex: 1 1 230px; min-width: 0; }
  .disconnect { margin-inline-start: auto; }
  iframe { display: block; width: 100%; border: 0; border-radius: var(--r-md); }
  p, ul { margin: 0; }
  ul { padding: 0; list-style: none; }
  .problem { color: var(--warning); }
  .row { flex: 1 1 240px; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center; gap: var(--sp-3); padding: var(--sp-2); text-align: start; border-radius: var(--r-sm); }
  .row:hover { background: var(--glass-hover); }
  .labels, strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--text-muted); }
  .art { width: 42px; height: 42px; display: grid; place-items: center; background: var(--glass); border-radius: var(--r-sm); overflow: hidden; }
  .art img { width: 100%; height: 100%; object-fit: cover; }
</style>
