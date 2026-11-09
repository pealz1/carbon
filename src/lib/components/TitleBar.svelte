<script lang="ts">
  import { goto } from "$app/navigation";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { dialogs } from "$lib/dialogs.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";

  let { showSearch = true }: { showSearch?: boolean } = $props();
  const appWindow = getCurrentWindow();
</script>

<header class="titlebar" data-tauri-drag-region>
  {#if showSearch}
    <nav class="history" aria-label="History">
      <button class="round" onclick={() => history.back()} aria-label="Back"><Icon name="back" size={18} /></button>
      <button class="round" onclick={() => history.forward()} aria-label="Forward"><Icon name="forward" size={18} /></button>
    </nav>
    <button class="search glass" onclick={() => goto("/search")}>
      <Icon name="search" size={16} />
      <span>Search songs, artists, albums</span>
      <kbd>Ctrl K</kbd>
    </button>
  {/if}
  <div class="spacer" data-tauri-drag-region></div>
  <div class="controls">
    {#if showSearch}
      <button onclick={() => (dialogs.shortcuts = true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><Icon name="keyboard" size={17} /></button>
      <button onclick={view.toggleFullscreen} aria-label={view.fullscreen ? "Leave full screen" : "Full screen"} title="Full screen (F11)">
        <Icon name={view.fullscreen ? "collapse" : "expand"} size={15} />
      </button>
    {/if}
    <button onclick={() => appWindow.minimize()} aria-label="Minimize"><Icon name="minimize" size={16} /></button>
    <button onclick={() => appWindow.toggleMaximize()} aria-label="Maximize"><Icon name="maximize" size={14} /></button>
    <button class="close" onclick={() => appWindow.close()} aria-label="Close"><Icon name="close" size={16} /></button>
  </div>
</header>

<style>
  .titlebar {
    height: var(--titlebar-h);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-left: var(--sp-4);
  }

  .history {
    display: flex;
    gap: var(--sp-1);
  }

  .round {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .round:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 34px;
    width: min(420px, 40vw);
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--text-faint);
    font-size: var(--fs-small);
    transition: color var(--dur-fast), border-color var(--dur-fast);
  }

  .search:hover {
    color: var(--text-muted);
    border-color: var(--glass-edge-top);
  }

  .search span {
    flex: 1;
    text-align: left;
  }

  kbd {
    font-family: inherit;
    font-size: var(--fs-micro);
    padding: 2px 6px;
    border-radius: var(--r-sm);
    background: var(--glass-hover);
    color: var(--text-faint);
  }

  .spacer {
    flex: 1;
    align-self: stretch;
  }

  .controls {
    display: flex;
    align-self: stretch;
  }

  .controls button {
    width: 46px;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .controls button:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .controls .close:hover {
    background: var(--danger);
    color: var(--accent-ink);
  }

  .controls button:focus-visible {
    outline-offset: -2px;
    border-radius: 0;
  }
</style>
