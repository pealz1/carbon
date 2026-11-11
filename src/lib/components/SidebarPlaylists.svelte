<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { hold } from "$lib/hold";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { folderMenu, playlistMenu } from "$lib/menus";
  import { buildTree, canMoveFolder, folderOf, moveFolder, movePlaylist, toggleCollapsed, type FolderNode } from "$lib/organizer";
  import { organizer } from "$lib/organizer.svelte";
  import { player } from "$lib/player.svelte";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import type { PlaylistSummary } from "$lib/spotify/types";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";

  // The sidebar's playlist tree: Carbon playlists, then pinned, folders and the rest from Spotify.
  const SECTION = "playlists";
  let { rail }: { rail: boolean } = $props();

  onMount(() => void carbonPlaylists.load());

  async function newCarbonPlaylist() {
    const id = await carbonPlaylists.create("New playlist");
    if (id) void goto(`/carbon/${id}`);
  }

  const path = $derived(page.url.pathname);
  const open = $derived(rail || !view.closed.includes(SECTION));
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

  /** Press-and-hold opens the same menu as right-click. */
  const holdFor = (items: () => MenuEntry[]) => ({ onhold: (at: { x: number; y: number }, node: HTMLElement) => menu.openAt(at.x, at.y, items(), node) });
</script>

{#snippet playlistRow(playlist: PlaylistSummary, depth: number)}
  <a
    href="/playlist/{playlist.id}"
    class="row pressable"
    class:active={path === `/playlist/${playlist.id}`}
    style="--depth: {rail ? 0 : depth}"
    draggable="true"
    title={rail ? playlist.name : undefined}
    ondragstart={(e) => dragStart(e, { kind: "playlist", id: playlist.id })}
    ondragend={dragEnd}
    oncontextmenu={(e) => menu.open(e, playlistMenu(playlist))}
    use:hold={holdFor(() => playlistMenu(playlist))}
  >
    {#if playlist.image}
      <img src={playlist.image} alt="" width="24" height="24" loading="lazy" decoding="async" draggable="false" />
    {:else}
      <span class="tile"><Icon name="note" size={13} /></span>
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
      style="--depth: {rail ? 0 : depth}"
      aria-expanded={!f.collapsed}
      draggable="true"
      title={rail ? f.name : undefined}
      ondragstart={(e) => dragStart(e, { kind: "folder", id: f.id })}
      ondragend={dragEnd}
      ondragover={(e) => dragOver(e, f.id)}
      ondragleave={() => dropTarget === f.id && (dropTarget = null)}
      ondrop={(e) => drop(e, f.id)}
      onclick={() => organizer.change((lib) => toggleCollapsed(lib, f.id))}
      oncontextmenu={(e) => menu.open(e, folderMenu(f))}
      use:hold={holdFor(() => folderMenu(f))}
    >
      <span class="tile"><Icon name="folder" size={14} /></span>
      <span class="name">{f.name}</span>
      <span class="count tabular">{node.total}</span>
      <span class="chevron" class:open={!f.collapsed}><Icon name="forward" size={12} /></span>
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

<section
  class="playlists"
  class:drop={dropTarget === ROOT}
  aria-label="Playlists"
  ondragover={(e) => dragOver(e, null)}
  ondragleave={(e) => e.target === e.currentTarget && dropTarget === ROOT && (dropTarget = null)}
  ondrop={(e) => drop(e, null)}
>
  <div class="head">
    <button class="section-head" aria-expanded={open} onclick={() => view.toggleSection(SECTION)}>
      <span>Playlists</span>
      <span class="fold" class:closed={!open}><Icon name="down" size={14} /></span>
    </button>
    <button class="tool" onclick={() => (dialogs.folder = { mode: "create", parentId: null })} aria-label="New folder" title="New folder">
      <Icon name="folder" size={15} />
    </button>
    {#if services.active.spotify}
      <button class="tool" onclick={() => (dialogs.playlist = { mode: "create" })} aria-label="New Spotify playlist" title="New Spotify playlist">
        <Icon name="plus" size={16} />
      </button>
    {/if}
  </div>
  {#if open}
    {#each carbonPlaylists.list as playlist (playlist.id)}
      <a href="/carbon/{playlist.id}" class="row pressable" class:active={path === `/carbon/${playlist.id}`} title={rail ? playlist.name : undefined}>
        <span class="tile carbon"><Icon name="listAdd" size={13} /></span>
        <span class="name">{playlist.name}</span>
      </a>
    {/each}
    <button class="row" onclick={newCarbonPlaylist} title={rail ? "New Carbon playlist" : undefined}>
      <span class="tile ghost"><Icon name="plus" size={13} /></span>
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
  {/if}
</section>

<style>
  .playlists {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-radius: var(--r-md);
  }

  .playlists.drop {
    background: var(--chrome-hover);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .head .section-head {
    flex: 1;
  }

  .tool {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    color: var(--chrome-text-muted);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .head:hover .tool,
  .tool:focus-visible {
    opacity: 1;
  }

  .tool:hover {
    color: var(--chrome-text);
    background: var(--chrome-hover);
  }

  .folder-row {
    font-weight: 600;
  }

  .folder.drop > .folder-row {
    background: var(--chrome-active);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .chevron {
    display: grid;
    color: var(--chrome-text-muted);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .count {
    font-size: var(--fs-caption);
    color: var(--chrome-text-muted);
    font-weight: 500;
  }

  .pin {
    display: grid;
    color: var(--chrome-text-muted);
  }

  .live {
    width: 6px;
    height: 6px;
    margin-right: 2px;
    border-radius: var(--r-pill);
    background: var(--accent);
  }

  .row img,
  .tile {
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .tile {
    display: grid;
    place-items: center;
    background: var(--chrome-field);
    color: var(--chrome-text-muted);
  }

  .tile.carbon {
    color: var(--accent);
  }

  .tile.ghost {
    background: none;
    box-shadow: inset 0 0 0 1px var(--chrome-field);
  }

  :global(.sidebar.rail) .head .tool,
  :global(.sidebar.rail) .count,
  :global(.sidebar.rail) .chevron,
  :global(.sidebar.rail) .pin {
    display: none;
  }
</style>
