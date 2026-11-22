<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { isMac } from "$lib/platform";
  import { appMenu } from "$lib/app-menu";
  import { menu } from "$lib/menu.svelte";
  import { updates } from "$lib/updates.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";

  /** `controls` off: just the mark and the window buttons (sign-in screens). */
  let { controls = true }: { controls?: boolean } = $props();
  const appWindow = getCurrentWindow();
  let maximized = $state(false);

  const syncMaximized = () => !isMac &&
    appWindow.isMaximized().then(
      (on) => (maximized = on),
      (e) => console.warn("[titlebar] couldn't read the window state", e),
    );
  $effect(() => void syncMaximized());
</script>

<svelte:window onresize={syncMaximized} />

<header class="titlebar" data-tauri-drag-region>
  <button class="mark" onclick={() => location.reload()} aria-label="Refresh Carbon" title="Refresh"><Logo size={18} /></button>
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
    <!-- A found update lives here, quietly: its download fills the pill, then one click restarts into it. -->
    {#if updates.state === "available" || updates.state === "downloading" || updates.state === "ready"}
      <button class="update" class:ready={updates.state === "ready"} style="--p: {updates.state === 'downloading' ? updates.progress : 1}" disabled={updates.state === "downloading"} onclick={() => updates.install()}>
        <Icon name="import" size={15} />
        <span>{updates.state === "ready" ? "Restart to update" : updates.state === "downloading" ? "Updating" : "Update"}</span>
      </button>
    {/if}
    <div class="tools">
      <button class="tb" class:on={view.lyrics} onclick={view.toggleLyrics} aria-pressed={view.lyrics} aria-label="Lyrics" title="Lyrics">
        <Icon name="lyrics" size={18} />
      </button>
      <button class="tb" class:on={view.queue} onclick={view.toggleQueue} aria-pressed={view.queue} aria-label="Queue" title="Queue">
        <Icon name="queue" size={18} />
      </button>
      <button class="tb" onclick={(e) => menu.open(e, appMenu())} aria-label="More" aria-haspopup="menu" title="More"><Icon name="more" size={18} /></button>
    </div>
    {#if !isMac}<span class="rule" aria-hidden="true"></span>{/if}
  {/if}
  {#if !isMac}
  <div class="window">
    <button class="tb" onclick={() => appWindow.minimize()} aria-label="Minimize"><Icon name="minimize" size={16} /></button>
    <button class="tb" onclick={() => appWindow.toggleMaximize()} aria-label={maximized ? "Restore" : "Maximize"}>
      <Icon name={maximized ? "restore" : "maximize"} size={15} />
    </button>
    <button class="tb close" onclick={() => appWindow.close()} aria-label="Close"><Icon name="close" size={16} /></button>
  </div>
  {/if}
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

  /* The mark refreshes the app: it turns once under the pointer, like a reload arrow. */
  .mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin: 0 var(--sp-2) 0 -4px;
    border-radius: var(--r-md);
    transition:
      background var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  .mark:hover {
    background: var(--chrome-hover);
  }

  .mark > :global(*) {
    transition:
      rotate 600ms var(--ease-out),
      scale var(--dur-spring) var(--ease-spring);
  }

  .mark:hover > :global(*) {
    rotate: 360deg;
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
    color: var(--chrome-text);
    opacity: 0.86;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      opacity var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
  }

  .tb:hover {
    opacity: 1;
    background: var(--chrome-hover);
    box-shadow: var(--rim);
    color: var(--chrome-text);
  }

  .tb.on {
    opacity: 1;
    background: var(--chrome-active);
    box-shadow: var(--rim);
    color: var(--chrome-text);
  }

  .window .tb {
    width: 42px;
  }

  .window .close:hover {
    background: var(--danger);
    color: var(--ink);
  }

  .update {
    position: relative;
    isolation: isolate;
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-right: var(--sp-2);
    padding: 0 var(--sp-3);
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--chrome-field);
    box-shadow: var(--rim);
    color: var(--chrome-text);
    font-size: var(--fs-caption);
    font-weight: 650;
    animation: update-in var(--dur-spring) var(--ease-spring) backwards;
    transition:
      color var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  /* The download fills the pill from the left; ready, it is all accent. */
  .update::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--accent);
    transform-origin: left;
    transform: scaleX(var(--p));
    opacity: 0.28;
    transition:
      transform var(--dur-med) linear,
      opacity var(--dur-med);
  }

  .update.ready {
    color: var(--accent-ink);
  }

  .update.ready::before {
    opacity: 1;
  }

  .update:disabled {
    cursor: default;
  }

  @keyframes update-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.9);
    }
  }

  .rule {
    width: 1px;
    height: 18px;
    margin: 0 var(--sp-2);
    background: var(--chrome-hover);
  }
</style>
