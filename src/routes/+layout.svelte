<script lang="ts">
  import "../app.css";
  import { afterNavigate, goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, type Snippet } from "svelte";
  import { account } from "$lib/account.svelte";
  import Ambient from "$lib/components/Ambient.svelte";
  import CarbonSignIn from "$lib/components/CarbonSignIn.svelte";
  import Cinema from "$lib/components/Cinema.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import FolderDialog from "$lib/components/FolderDialog.svelte";
  import LiquidFilter from "$lib/components/LiquidFilter.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import NowPlayingBar from "$lib/components/NowPlayingBar.svelte";
  import PlaylistDialog from "$lib/components/PlaylistDialog.svelte";
  import ShortcutsSheet from "$lib/components/ShortcutsSheet.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import ServiceGate from "$lib/components/ServiceGate.svelte";
  import TagsDialog from "$lib/components/TagsDialog.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import YoutubeStage from "$lib/components/YoutubeStage.svelte";
  import YtPlaylistDialog from "$lib/components/YtPlaylistDialog.svelte";
  import { redirectFor, services } from "$lib/services.svelte";
  import { youtube } from "$lib/youtube/session.svelte";
  import Toasts from "$lib/components/Toasts.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { handleKey } from "$lib/keyboard";
  import { sound } from "$lib/local/sound.svelte";
  import { organizer } from "$lib/organizer.svelte";
  import { player } from "$lib/player.svelte";
  import { session } from "$lib/session.svelte";
  import { view } from "$lib/view.svelte";

  let { children }: { children: Snippet } = $props();
  let main = $state<HTMLElement>();

  onMount(() => {
    void account.boot();
    void organizer.load();
    void view.syncFullscreen();
    void sound.boot();
  });

  // Music services start once the Carbon account gate (if this build has one) is passed.
  let servicesStarted = false;
  $effect(() => {
    if (!account.open || servicesStarted) return;
    servicesStarted = true;
    void services.boot();
  });
  // Pages of a service that isn't running (Spotify's home with YouTube Music only) go home,
  // without rendering first: they would call that service.
  const redirect = $derived(services.screen === "app" ? redirectFor(page.url.pathname, services.active) : null);
  $effect(() => void (redirect && goto(redirect, { replaceState: true })));
  afterNavigate(() => main?.scrollTo({ top: 0 }));

  // Native page transitions; sidebar, title bar and dock are named so they stay put.
  onNavigate((navigation) => {
    if (!document.startViewTransition || document.documentElement.dataset.effects === "minimal") return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head><title>Carbon</title></svelte:head>
<svelte:window onkeydown={(e) => services.screen === "app" && handleKey(e)} onresize={() => view.syncFullscreen()} />

<LiquidFilter />
<Ambient image={player.track?.album?.image ?? null} intense={page.url.pathname === "/now-playing"} />

{#if account.required && account.status === "unknown"}
  <div class="boot" data-tauri-drag-region><Logo size={56} /></div>
{:else if !account.open}
  <CarbonSignIn />
{:else if services.screen !== "app"}
  <ServiceGate />
{:else}
  <div class="app" inert={view.cinema}>
    <Sidebar />
    <TitleBar />
    <div class="stage">
      <main bind:this={main}>
        {#if session.error}
          <p class="banner" role="alert">
            {session.error}
            <button onclick={() => (session.error = null)}>Dismiss</button>
          </p>
        {/if}
        {#if session.needsReconsent}
          <p class="banner" role="status">
            Playlist editing needs a few more Spotify permissions.
            <span class="banner-actions">
              <button onclick={() => session.reconsent()}>Sign in again</button>
              <button onclick={() => (session.needsReconsent = false)}>Later</button>
            </span>
          </p>
        {/if}
        {#if !redirect}{@render children()}{/if}
      </main>
      <Toasts />
      <NowPlayingBar />
    </div>
  </div>
  {#if view.cinema}<Cinema />{/if}
  <YoutubeStage />
  <ContextMenu />
  {#if dialogs.playlist}
    {#key dialogs.playlist}<PlaylistDialog request={dialogs.playlist} />{/key}
  {/if}
  {#if dialogs.folder}
    {#key dialogs.folder}<FolderDialog request={dialogs.folder} />{/key}
  {/if}
  {#if dialogs.tags}
    {#key dialogs.tags}<TagsDialog playlist={dialogs.tags} />{/key}
  {/if}
  {#if dialogs.shortcuts}<ShortcutsSheet />{/if}
  {#if youtube.dialog}
    {#key youtube.dialog}<YtPlaylistDialog request={youtube.dialog} />{/key}
  {/if}
{/if}

<style>
  .boot {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    place-items: center;
    animation: breathe 1.4s var(--ease-out) infinite alternate;
  }

  @keyframes breathe {
    from {
      opacity: 0.4;
      transform: scale(0.94);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .app {
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    grid-template-rows: var(--titlebar-h) minmax(0, 1fr);
  }

  .stage {
    position: relative;
    min-height: 0;
  }

  /* Excluded from the page transition so only the content glides. */
  .app :global(.sidebar) {
    view-transition-name: sidebar;
  }

  .app :global(.titlebar) {
    view-transition-name: titlebar;
  }

  .stage :global(.dock) {
    view-transition-name: dock;
  }

  :global(.ambient) {
    view-transition-name: ambient;
  }

  main {
    height: 100%;
    overflow-y: auto;
    padding: 0 var(--sp-5) calc(var(--dock-h) + var(--sp-6));
    scrollbar-gutter: stable;
  }

  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin: var(--sp-2) 0 0;
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--r-md);
    background: var(--glass-strong);
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .banner button {
    color: var(--text);
    font-weight: 600;
  }

  .banner-actions {
    display: flex;
    gap: var(--sp-4);
  }
</style>
