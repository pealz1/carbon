<script lang="ts">
  // "Add to Carbon playlist": a small menu in the top layer (native popover), so rows that clip
  // their contents can still open it. Arrow keys move between items; Escape closes.
  import { tick } from "svelte";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import type { Track } from "$lib/spotify/types";
  import Icon from "./Icon.svelte";

  const DONE_MS = 1600;
  const MENU_GAP = 6;

  let { tracks, label = "Add to Carbon playlist", wide = false }: { tracks: Track[]; label?: string; wide?: boolean } = $props();
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();
  let done = $state(false);
  /** Long lists render one of these per row, so the menu's items only exist while it's open. */
  let isOpen = $state(false);

  async function open() {
    if (!trigger || !menu) return;
    await carbonPlaylists.load();
    const rect = trigger.getBoundingClientRect();
    menu.style.setProperty("--right", `${Math.max(8, innerWidth - rect.right)}px`);
    menu.style.setProperty("--top", `${rect.bottom + MENU_GAP}px`);
    isOpen = true;
    await tick();
    menu.showPopover();
    menu.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }

  async function addTo(id: string) {
    menu?.hidePopover();
    if (await carbonPlaylists.add(id, tracks)) {
      done = true;
      setTimeout(() => (done = false), DONE_MS);
    }
    trigger?.focus();
  }

  async function addToNew() {
    const id = await carbonPlaylists.create(tracks.length === 1 ? tracks[0].name : "New playlist");
    if (id) await addTo(id);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
</script>

<button bind:this={trigger} class="trigger" class:wide class:done onclick={open} aria-haspopup="menu" aria-label={label} title={label}>
  <Icon name={done ? "check" : "listAdd"} size={16} />
  {#if wide}<span>{done ? "Added" : label}</span>{/if}
</button>

<div
  bind:this={menu}
  popover="auto"
  class="menu"
  role="menu"
  aria-label="Carbon playlists"
  tabindex="-1"
  onkeydown={onKey}
  ontoggle={(e) => (isOpen = (e as ToggleEvent).newState === "open")}
>
  {#if isOpen}
    <p class="eyebrow">Add to Carbon playlist</p>
    {#each carbonPlaylists.list as playlist (playlist.id)}
      <button role="menuitem" onclick={() => addTo(playlist.id)}>{playlist.name}</button>
    {/each}
    <button role="menuitem" class="new" onclick={addToNew}><Icon name="plus" size={14} /> New playlist</button>
    {#if carbonPlaylists.error}<p class="error" role="alert">{carbonPlaylists.error}</p>{/if}
  {/if}
</div>

<style>
  .trigger {
    width: 28px;
    height: 28px;
    display: inline-grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
  }

  .trigger:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .trigger:active {
    transform: scale(0.92);
  }

  /* Sits with a detail header's 44 px actions. */
  .trigger.wide {
    width: auto;
    height: 44px;
    display: inline-flex;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px rgb(255 255 255 / 0.08);
    color: var(--text);
    font-weight: 600;
  }

  .trigger.wide:hover {
    background: rgb(255 255 255 / 0.15);
  }

  .trigger.done {
    color: var(--accent);
  }

  .menu {
    position: fixed;
    inset: var(--top) var(--right) auto auto;
    margin: 0;
    min-width: 220px;
    max-height: min(360px, 60vh);
    overflow-y: auto;
    padding: 5px;
    border: 0;
    border-radius: var(--r-lg);
    background: var(--grain), var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-shadow);
    color: var(--text);
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
    transform-origin: top right;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-med) var(--ease-out);
  }

  .menu:popover-open {
    opacity: 1;
    transform: none;
  }

  @starting-style {
    .menu:popover-open {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  .eyebrow {
    margin: var(--sp-1) var(--sp-2) var(--sp-2);
  }

  [role="menuitem"] {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--r-sm);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  [role="menuitem"]:hover,
  [role="menuitem"]:focus-visible {
    background: var(--glass-hover);
    outline: none;
  }

  .new {
    color: var(--accent);
    font-weight: 600;
  }

  .error {
    margin: var(--sp-2);
    color: var(--warning);
    font-size: var(--fs-small);
  }
</style>
