<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { menu } from "$lib/menu.svelte";
  import { folderMenu, playlistMenu } from "$lib/menus";
  import { buildTree, canMoveFolder, folderOf, moveFolder, movePlaylist, toggleCollapsed, type FolderNode } from "$lib/organizer";
  import { organizer } from "$lib/organizer.svelte";
  import { player } from "$lib/player.svelte";
  import { session } from "$lib/session.svelte";
  import type { PlaylistSummary } from "$lib/spotify/types";
  import Icon, { type IconName } from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import { services, type Source } from "$lib/services.svelte";
  import { youtube } from "$lib/youtube/session.svelte";
  import SourceSwitch, { sourceOfPath } from "./SourceSwitch.svelte";
  import YoutubeSidebar from "./YoutubeSidebar.svelte";
  import { specular } from "$lib/liquid";

  type NavItem = { href: string; label: string; icon: IconName };
  const SOUND: NavItem = { href: "/sound", label: "Sound", icon: "equalizer" };
  const NAV: Record<Source, NavItem[]> = {
    spotify: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/search", label: "Search", icon: "search" },
      { href: "/library", label: "Library", icon: "library" },
      SOUND,
    ],
    youtube: [
      { href: "/youtube", label: "Home", icon: "home" },
      { href: "/youtube/search", label: "Search", icon: "search" },
      { href: "/youtube/library", label: "Library", icon: "library" },
      SOUND,
    ],
    local: [{ href: "/local", label: "Local files", icon: "folder" }, SOUND],
  };

  // Shared pages (settings, sound, now playing) keep whichever source was showing.
  let source = $state<Source>(sourceOfPath(page.url.pathname) ?? "spotify");
  $effect(() => {
    const next = sourceOfPath(page.url.pathname);
    if (next) source = next;
  });
  // Only services that are running; Spotify's list needs Spotify signed in.
  const shown = $derived(services.active.sources.includes(source) ? source : services.active.sources[0]);
  const me = $derived(session.profile ?? (services.active.youtube ? { name: youtube.account?.name ?? "YouTube Music", image: youtube.account?.image ?? null } : null));

  onMount(() => void carbonPlaylists.load());

  async function newPlaylist() {
    const id = await carbonPlaylists.create("New playlist");
    if (id) void goto(`/carbon/${id}`);
  }

  const path = $derived(page.url.pathname);
  const isActive = (href: string) => (href === "/" || href === "/youtube" ? path === href : path.startsWith(href));

  const tree = $derived(buildTree(organizer.data, session.playlists));
  const pinned = $derived(new Set(organizer.data.pins));

  // Drag and drop: playlists and folders onto folders, or onto the list itself for the top level.
  // Keyboard users get the same moves from the context menu ("Move to folder").
  type Dragged = { kind: "playlist" | "folder"; id: string };
  let dragging = $state<Dragged | null>(null);
  let dropTarget = $state<string | null>(null);
  const ROOT = "root";

  function canDrop(folderId: string | null): boolean {
    if (!dragging) return false;
    if (dragging.kind === "folder") return dragging.id !== folderId && canMoveFolder(organizer.data, dragging.id, folderId);
    return (folderOf(organizer.data.folders, dragging.id)?.id ?? null) !== folderId;
  }

  function dragStart(event: DragEvent, item: Dragged) {
    dragging = item;
    event.dataTransfer?.setData("text/plain", item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function dragOver(event: DragEvent, folderId: string | null) {
    if (!canDrop(folderId)) return;
    event.preventDefault();
    event.stopPropagation();
    dropTarget = folderId ?? ROOT;
  }

  function drop(event: DragEvent, folderId: string | null) {
    const item = dragging;
    if (!item || !canDrop(folderId)) return;
    event.preventDefault();
    event.stopPropagation();
    void organizer.change((lib) => (item.kind === "folder" ? moveFolder(lib, item.id, folderId) : movePlaylist(lib, item.id, folderId)));
    dragEnd();
  }

  function dragEnd() {
    dragging = null;
    dropTarget = null;
  }

  const playlistMenuFor = (event: MouseEvent | KeyboardEvent, playlist: PlaylistSummary) => menu.open(event, playlistMenu(playlist));
</script>

{#snippet playlistRow(playlist: PlaylistSummary, depth: number)}
  <a
    href="/playlist/{playlist.id}"
    class="row"
    class:active={path === `/playlist/${playlist.id}`}
    style="--depth: {depth}"
    draggable="true"
    ondragstart={(e) => dragStart(e, { kind: "playlist", id: playlist.id })}
    ondragend={dragEnd}
    oncontextmenu={(e) => playlistMenuFor(e, playlist)}
  >
    {#if playlist.image}
      <img src={playlist.image} alt="" width="32" height="32" loading="lazy" decoding="async" draggable="false" />
    {:else}
      <span class="blank-tile"></span>
    {/if}
    <span class="name">{playlist.name}</span>
    {#if player.contextUri === playlist.uri && !player.paused}
      <span class="live" aria-label="Playing"></span>
    {:else if pinned.has(playlist.id)}
      <span class="pin" aria-label="Pinned"><Icon name="pin" size={13} /></span>
    {/if}
  </a>
{/snippet}

{#snippet folderNode(node: FolderNode, depth: number)}
  {@const f = node.folder}
  <div class="folder" class:drop={dropTarget === f.id}>
    <button
      class="row folder-row"
      style="--depth: {depth}"
      aria-expanded={!f.collapsed}
      draggable="true"
      ondragstart={(e) => dragStart(e, { kind: "folder", id: f.id })}
      ondragend={dragEnd}
      ondragover={(e) => dragOver(e, f.id)}
      ondragleave={() => dropTarget === f.id && (dropTarget = null)}
      ondrop={(e) => drop(e, f.id)}
      onclick={() => organizer.change((lib) => toggleCollapsed(lib, f.id))}
      oncontextmenu={(e) => menu.open(e, folderMenu(f))}
    >
      <span class="chevron" class:open={!f.collapsed}><Icon name="forward" size={13} /></span>
      <span class="folder-tile"><Icon name="folder" size={16} /></span>
      <span class="name">{f.name}</span>
      <span class="count tabular">{node.total}</span>
    </button>
    {#if !f.collapsed}
      <div role="group" aria-label={f.name}>
        {#each node.children as child (child.folder.id)}
          {@render folderNode(child, depth + 1)}
        {/each}
        {#each node.playlists as playlist (playlist.id)}
          {@render playlistRow(playlist, depth + 1)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<aside class="sidebar liquid" use:specular>
  <div class="brand" data-tauri-drag-region>
    <Logo size={26} />
    <span class="wordmark">carbon</span>
  </div>

  <SourceSwitch source={shown} sources={services.active.sources} />

  <nav aria-label="Main">
    {#each NAV[shown] as item (item.href)}
      <a href={item.href} class="nav-item" class:active={isActive(item.href)} aria-current={isActive(item.href) ? "page" : undefined}>
        <Icon name={item.icon} size={19} />
        {item.label}
      </a>
    {/each}
  </nav>

  {#if shown === "youtube"}<YoutubeSidebar />{/if}
  <section
    class="playlists"
    class:off={shown === "youtube" || !services.active.spotify}
    class:drop={dropTarget === ROOT}
    aria-label="Your playlists"
    ondragover={(e) => dragOver(e, null)}
    ondragleave={(e) => e.target === e.currentTarget && dropTarget === ROOT && (dropTarget = null)}
    ondrop={(e) => drop(e, null)}
  >
    <div class="lib-head">
      <h2 class="eyebrow">Your music</h2>
      <button class="tool" onclick={() => (dialogs.folder = { mode: "create", parentId: null })} aria-label="New folder" title="New folder">
        <Icon name="folder" size={16} />
      </button>
      <button class="tool" onclick={() => (dialogs.playlist = { mode: "create" })} aria-label="New playlist" title="New playlist">
        <Icon name="plus" size={17} />
      </button>
    </div>
    <a href="/liked" class="row" class:active={path === "/liked"} style="--depth: 0">
      <span class="liked-tile"><Icon name="heart" size={15} filled /></span>
      <span class="name">Liked Songs</span>
    </a>
    {#each carbonPlaylists.list as playlist (playlist.id)}
      <a href="/carbon/{playlist.id}" class="row" class:active={path === `/carbon/${playlist.id}`}>
        <span class="carbon-tile"><Icon name="listAdd" size={15} /></span>
        <span class="name">{playlist.name}</span>
      </a>
    {/each}
    <button class="row new" onclick={newPlaylist}>
      <span class="carbon-tile ghost"><Icon name="plus" size={15} /></span>
      <span class="name">New Carbon playlist</span>
    </button>
    {#each tree.pinned as playlist (playlist.id)}
      {@render playlistRow(playlist, 0)}
    {/each}
    {#each tree.folders as node (node.folder.id)}
      {@render folderNode(node, 0)}
    {/each}
    {#each tree.loose as playlist (playlist.id)}
      {@render playlistRow(playlist, 0)}
    {/each}
  </section>

  {#if me}
    <footer class="profile">
      {#if me.image}
        <img src={me.image} alt="" width="28" height="28" class="avatar" />
      {:else}
        <span class="avatar initials">{me.name.slice(0, 1).toUpperCase()}</span>
      {/if}
      <span class="name">{me.name}</span>
      <a href="/settings" class="signout" class:active={path === "/settings"} aria-label="Settings" title="Settings">
        <Icon name="settings" size={18} />
      </a>
    </footer>
  {/if}
</aside>

<style>
  .sidebar {
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: var(--sp-2) 0 var(--sp-2) var(--sp-2);
    border-radius: var(--r-lg);
    padding: 0 var(--sp-2) var(--sp-2);
  }

  .brand {
    height: var(--titlebar-h);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) 0;
  }

  .wordmark {
    font-family: var(--font-display);
    font-weight: 650;
    font-size: 1.2rem;
    letter-spacing: -0.04em;
    pointer-events: none;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: var(--sp-3) 0 var(--sp-4);
  }

  .nav-item,
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    border-radius: var(--r-md);
    color: var(--text-muted);
    text-decoration: none;
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .nav-item {
    height: 40px;
    padding: 0 var(--sp-3);
    font-weight: 600;
  }

  .nav-item:hover,
  .row:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .nav-item.active,
  .row.active {
    background: var(--glass-active);
    color: var(--text);
    box-shadow: 0 1px 0 0 var(--glass-edge-top) inset;
  }

  .nav-item.active :global(svg) {
    color: var(--accent);
  }

  .playlists {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlists.off {
    display: none;
  }

  .playlists.drop {
    background: var(--glass-hover);
    border-radius: var(--r-md);
  }

  .lib-head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0 var(--sp-1) var(--sp-2) var(--sp-3);
  }

  .lib-head h2 {
    flex: 1;
  }

  .tool {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-faint);
    transition: color var(--dur-fast), background var(--dur-fast);
  }

  .tool:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .row {
    width: 100%;
    padding: 5px var(--sp-2) 5px calc(var(--sp-2) + var(--depth, 0) * var(--sp-3));
    font-size: var(--fs-small);
    text-align: left;
  }

  .folder-row {
    font-weight: 600;
  }

  .folder.drop > .folder-row {
    background: var(--glass-active);
    box-shadow: inset 0 0 0 1px var(--accent);
    color: var(--text);
  }

  .chevron {
    display: grid;
    place-items: center;
    width: 12px;
    margin-right: -4px;
    color: var(--text-faint);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .folder-tile {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--glass-hover);
    color: var(--text-muted);
  }

  .count {
    font-size: var(--fs-micro);
    color: var(--text-faint);
    font-weight: 500;
  }

  .pin {
    display: grid;
    color: var(--text-faint);
    margin-right: var(--sp-1);
  }

  .row img,
  .blank-tile,
  .liked-tile {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--r-sm);
    object-fit: cover;
  }

  .blank-tile {
    background: var(--glass-hover);
  }

  .carbon-tile {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--glass-active);
    color: var(--accent);
    box-shadow: 0 1px 0 0 var(--glass-edge-top) inset;
  }

  .carbon-tile.ghost {
    background: none;
    border: 1px dashed var(--glass-edge-top);
    box-shadow: none;
  }

  .row.new {
    width: 100%;
    text-align: left;
  }

  .liked-tile {
    display: grid;
    place-items: center;
    color: var(--accent-ink);
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live {
    width: 7px;
    height: 7px;
    margin-right: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .profile {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-2) 0;
    margin-top: var(--sp-2);
    border-top: 1px solid var(--glass-edge);
    font-size: var(--fs-small);
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .initials {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    font-weight: 700;
  }

  .signout {
    color: var(--text-faint);
    padding: var(--sp-1);
    border-radius: var(--r-sm);
  }

  .signout:hover {
    color: var(--text);
    background: var(--glass-hover);
  }
</style>
