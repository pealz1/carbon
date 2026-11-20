<script lang="ts">
  import type { MenuEntry, MenuItem } from "$lib/menu.svelte";
  import Icon from "./Icon.svelte";
  import MenuPanel from "./MenuPanel.svelte";

  // A menu (or submenu) panel: WAI-ARIA menu pattern with arrow keys, Home/End, → into a
  // submenu, ← / Esc back out, Enter/Space to choose and Tab to leave.
  let {
    items,
    x,
    y,
    flipX = null,
    autofocus = true,
    onclose,
    onback,
  }: {
    items: MenuEntry[];
    x: number;
    y: number;
    /** Left edge of the parent panel: open leftwards from here if there's no room on the right. */
    flipX?: number | null;
    /** Focus the first item on open (keyboard), or leave focus where it is (hover). */
    autofocus?: boolean;
    onclose: () => void;
    onback?: () => void;
  } = $props();

  const MARGIN = 8;
  let panel = $state<HTMLElement>();
  let place = $state({ left: 0, top: 0, ready: false });
  let openIndex = $state<number | null>(null);
  let submenuAt = $state({ x: 0, y: 0, flipX: 0, focus: false });

  const isItem = (entry: MenuEntry | undefined): entry is MenuItem => !!entry && entry !== "separator";
  const buttons = () => [...(panel?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)") ?? [])];

  $effect(() => {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const fitsRight = x + rect.width <= innerWidth - MARGIN;
    const left = fitsRight || flipX === null ? Math.min(x, innerWidth - rect.width - MARGIN) : flipX - rect.width;
    const top = Math.min(y, innerHeight - rect.height - MARGIN);
    place = { left: Math.max(MARGIN, left), top: Math.max(MARGIN, top), ready: true };
    if (autofocus) buttons()[0]?.focus();
  });

  function openSubmenu(index: number, button: HTMLElement, focusFirst: boolean) {
    const rect = button.getBoundingClientRect();
    const panelRect = panel!.getBoundingClientRect();
    submenuAt = { x: panelRect.right - 4, y: rect.top - 6, flipX: panelRect.left + 4, focus: focusFirst };
    openIndex = index;
  }

  function activate(index: number, button: HTMLElement) {
    const entry = items[index];
    if (!isItem(entry) || entry.disabled) return;
    if (entry.items) return openIndex === index ? (openIndex = null) : openSubmenu(index, button, true);
    onclose();
    void entry.action?.();
  }

  function hover(index: number, button: HTMLElement) {
    const entry = items[index];
    if (isItem(entry) && entry.items && !entry.disabled) openSubmenu(index, button, false);
    else openIndex = null;
    button.focus();
  }

  function onKey(event: KeyboardEvent) {
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    const handled = () => (event.preventDefault(), event.stopPropagation());
    switch (event.key) {
      case "ArrowDown":
        handled();
        return move(at + 1);
      case "ArrowUp":
        handled();
        return move(at - 1);
      case "Home":
        handled();
        return move(0);
      case "End":
        handled();
        return move(list.length - 1);
      case "ArrowRight": {
        handled();
        const button = list[at];
        const index = button ? Number(button.dataset.index) : -1;
        if (isItem(items[index]) && (items[index] as MenuItem).items) openSubmenu(index, button, true);
        return;
      }
      case "ArrowLeft":
        handled();
        return onback?.();
      case "Escape":
        handled();
        return onback ? onback() : onclose();
      case "Tab":
        event.preventDefault();
        return onclose();
    }
  }

  function back() {
    const index = openIndex;
    openIndex = null;
    panel?.querySelector<HTMLButtonElement>(`:scope > button[data-index="${index}"]`)?.focus();
  }
</script>

<div
  bind:this={panel}
  class="menu-panel glass"
  class:ready={place.ready}
  role="menu"
  tabindex="-1"
  style="left: {place.left}px; top: {place.top}px"
  onkeydown={onKey}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each items as entry, i (i)}
    {#if entry === "separator"}
      <div class="separator" role="separator"></div>
    {:else}
      <button
        role="menuitem"
        tabindex="-1"
        data-index={i}
        class:danger={entry.danger}
        class:open={openIndex === i}
        disabled={entry.disabled}
        aria-haspopup={entry.items ? "menu" : undefined}
        aria-expanded={entry.items ? openIndex === i : undefined}
        style="--depth: {entry.depth ?? 0}"
        onclick={(e) => activate(i, e.currentTarget)}
        onpointerenter={(e) => hover(i, e.currentTarget)}
      >
        <span class="icon">{#if entry.icon}<Icon name={entry.icon} size={18} filled={entry.icon === "heart" && entry.label.startsWith("Remove")} />{/if}</span>
        <span class="label">{entry.label}</span>
        {#if entry.items}<Icon name="forward" size={14} />{/if}
      </button>
    {/if}
  {/each}
</div>

{#if openIndex !== null && isItem(items[openIndex]) && items[openIndex]}
  {@const parent = items[openIndex] as MenuItem}
  {#key openIndex}
    <MenuPanel items={parent.items ?? []} x={submenuAt.x} y={submenuAt.y} flipX={submenuAt.flipX} autofocus={submenuAt.focus} {onclose} onback={back} />
  {/key}
{/if}

<style>
  .menu-panel {
    position: fixed;
    z-index: 50;
    min-width: 232px;
    max-width: 320px;
    max-height: min(460px, calc(100vh - 16px));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px;
    border-radius: var(--r-lg);
    opacity: 0;
    transform: scale(0.86);
    transform-origin: top left;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform 320ms var(--ease-spring);
  }

  .menu-panel.ready {
    opacity: 1;
    transform: none;
  }

  .menu-panel:focus {
    outline: none;
  }

  button {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    position: relative;
    isolation: isolate;
    min-height: 36px;
    padding: 0 var(--sp-3) 0 calc(var(--sp-3) + var(--depth) * var(--sp-3));
    border-radius: var(--r-md);
    color: var(--text);
    font-size: var(--fs-body);
    text-align: left;
    transition: transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  /* The highlight grows into place under the pointer: a lit, raised strip, not a flat tint. */
  button::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--glass-active);
    box-shadow: var(--rim);
    opacity: 0;
    scale: 0.94 0.8;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      scale var(--dur-med) var(--ease-spring);
  }

  button:hover::before,
  button:focus::before,
  button.open::before {
    opacity: 1;
    scale: 1;
  }

  button:hover,
  button:focus,
  button.open {
    outline: none;
  }

  button:disabled::before {
    opacity: 0;
  }

  button:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  button:disabled {
    color: var(--text-faint);
    cursor: default;
  }

  button.danger {
    color: var(--danger);
  }

  .icon {
    width: 20px;
    display: grid;
    place-items: center;
    flex: none;
    color: var(--text);
    opacity: 0.8;
    transition:
      opacity var(--dur-fast),
      scale var(--dur-med) var(--ease-spring);
  }

  button:hover .icon,
  button:focus .icon {
    opacity: 1;
    scale: 1.12;
  }

  .danger .icon {
    color: inherit;
  }

  .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .separator {
    height: 1px;
    margin: 4px var(--sp-3);
    background: var(--glass-edge);
    flex: none;
  }
</style>
