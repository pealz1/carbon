<script lang="ts">
  import { goto } from "$app/navigation";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { dialogs } from "$lib/dialogs.svelte";
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";

  /** `controls` off: just the mark and the window buttons (sign-in screens). */
  let { controls = true }: { controls?: boolean } = $props();
  const appWindow = getCurrentWindow();
  let maximized = $state(false);

  const syncMaximized = () =>
    appWindow.isMaximized().then(
      (on) => (maximized = on),
      (e) => console.warn("[titlebar] couldn't read the window state", e),
    );
  $effect(() => void syncMaximized());

  const moreItems = (): MenuEntry[] => [
    { label: "Now playing", icon: "album", action: () => goto("/now-playing") },
    { label: "Cinema mode", icon: "screen", action: view.enterCinema },
    { label: view.fullscreen ? "Leave full screen" : "Full screen", icon: view.fullscreen ? "collapse" : "expand", action: view.toggleFullscreen },
    "separator",
    { label: "Keyboard shortcuts", icon: "keyboard", action: () => (dialogs.shortcuts = true) },
    { label: "Settings", icon: "settings", action: () => goto("/settings") },
  ];
</script>

<svelte:window onresize={syncMaximized} />

<header class="titlebar" data-tauri-drag-region>
  <span class="mark" data-tauri-drag-region><Logo size={18} /></span>
  {#if controls}
    <nav class="lead" aria-label="History and layout">
      <button class="tb" onclick={() => history.back()} aria-label="Back" title="Back"><Icon name="back" size={18} /></button>
      <button class="tb" onclick={() => history.forward()} aria-label="Forward" title="Forward"><Icon name="forward" size={18} /></button>
      <button class="tb" onclick={view.toggleRail} aria-label={view.rail ? "Expand sidebar" : "Collapse sidebar"} title={view.rail ? "Expand sidebar" : "Collapse sidebar"}>
        <Icon name="sidebar" size={18} />
      </button>
    </nav>
  {/if}
  <div class="spacer" data-tauri-drag-region></div>
  {#if controls}
    <div class="tools">
      <button class="tb" class:on={view.lyrics} onclick={view.toggleLyrics} aria-pressed={view.lyrics} aria-label="Lyrics" title="Lyrics">
        <Icon name="lyrics" size={18} />
      </button>
      <button class="tb" class:on={view.queue} onclick={view.toggleQueue} aria-pressed={view.queue} aria-label="Queue" title="Queue">
        <Icon name="queue" size={18} />
      </button>
      <button class="tb" onclick={(e) => menu.open(e, moreItems())} aria-label="More" aria-haspopup="menu" title="More"><Icon name="more" size={18} /></button>
    </div>
    <span class="rule" aria-hidden="true"></span>
  {/if}
  <div class="window">
    <button class="tb" onclick={() => appWindow.minimize()} aria-label="Minimize"><Icon name="minimize" size={16} /></button>
    <button class="tb" onclick={() => appWindow.toggleMaximize()} aria-label={maximized ? "Restore" : "Maximize"}>
      <Icon name={maximized ? "restore" : "maximize"} size={15} />
    </button>
    <button class="tb close" onclick={() => appWindow.close()} aria-label="Close"><Icon name="close" size={16} /></button>
  </div>
</header>

<style>
  .titlebar {
    height: var(--titlebar-h);
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0 var(--sp-2) 0 var(--sp-4);
    color: var(--chrome-text-muted);
  }

  .mark {
    display: grid;
    place-items: center;
    width: 24px;
    margin-right: var(--sp-3);
  }

  .lead,
  .tools,
  .window {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .spacer {
    flex: 1;
    align-self: stretch;
  }

  .tb {
    width: 36px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    color: inherit;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .tb:hover {
    background: var(--chrome-hover);
    color: var(--chrome-text);
  }

  .tb.on {
    background: var(--chrome-active);
    color: var(--accent);
  }

  .window .tb {
    width: 42px;
  }

  .window .close:hover {
    background: var(--danger);
    color: var(--ink);
  }

  .rule {
    width: 1px;
    height: 18px;
    margin: 0 var(--sp-2);
    background: var(--chrome-hover);
  }
</style>
