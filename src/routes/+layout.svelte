<script lang="ts">
  import "../app.css";
  import { afterNavigate, goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, tick, type Snippet } from "svelte";
  import { account } from "$lib/account.svelte";
  import { blocklist } from "$lib/blocklist.svelte";
  import { dismissBootScreen } from "$lib/boot-screen";
  import Ambient from "$lib/components/Ambient.svelte";
  import CarbonSignIn from "$lib/components/CarbonSignIn.svelte";
  import Cinema from "$lib/components/Cinema.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import CompactPlayer from "$lib/components/CompactPlayer.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import FolderDialog from "$lib/components/FolderDialog.svelte";
  import LibraryTools from "$lib/components/LibraryTools.svelte";
  import LyricsPanel from "$lib/components/LyricsPanel.svelte";
  import NowPlayingBar from "$lib/components/NowPlayingBar.svelte";
  import PlaylistDialog from "$lib/components/PlaylistDialog.svelte";
  import QueuePanel from "$lib/components/QueuePanel.svelte";
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
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { handleKey } from "$lib/keyboard";
  import { sound } from "$lib/local/sound.svelte";
  import { organizer } from "$lib/organizer.svelte";
  import { player } from "$lib/player.svelte";
  import { compact } from "$lib/popout/compact.svelte";
  import { popouts } from "$lib/popout/host.svelte";
  import { isPopoutPath } from "$lib/popout/now";
  import { prefs } from "$lib/preferences.svelte";
  import { session } from "$lib/session.svelte";
  import { installSoundFeedback, setSoundGate } from "$lib/sfx";
  import { useSmartShuffle } from "$lib/smart-shuffle-play";
  import { view } from "$lib/view.svelte";

  let { children }: { children: Snippet } = $props();
  let main = $state<HTMLElement>();
  // The mini player and lyrics windows only mirror this window's player; they start nothing.
  const popout = isPopoutPath(page.url.pathname);

  onMount(() => {
    if (popout) return;
    void account.boot();
    void organizer.load();
    void view.syncFullscreen();
    void sound.boot();
    useSmartShuffle();
    void blocklist.load(); // and starts skipping blocked songs
    setSoundGate(() => ({
      enabled: prefs.value?.uiSounds ?? false,
      volume: prefs.value?.uiSoundVolume ?? 0,
      paused: player.paused,
      trackUri: player.track?.uri ?? null,
    }));
    const stopPopouts = popouts.start();
    const stopSounds = installSoundFeedback(document);
    return () => (stopPopouts(), stopSounds());
  });

  // Music services start once the Carbon account gate (if this build has one) is passed.
  let servicesStarted = false;
  $effect(() => {
    if (popout || !account.open || servicesStarted) return;
    servicesStarted = true;
    void services.boot();
  });
  // Pages of a service that isn't running (Spotify's home with YouTube Music only) go home,
  // without rendering first: they would call that service.
  const redirect = $derived(services.screen === "app" ? redirectFor(page.url.pathname, services.active) : null);
  $effect(() => void (redirect && goto(redirect, { replaceState: true })));

  // The loading screen in app.html stays until we know which screen to show and it has painted.
  const booting = $derived(!popout && ((account.required && account.status === "unknown") || (account.open && services.screen === "booting")));
  $effect(() => {
    if (!booting) void tick().then(() => requestAnimationFrame(() => dismissBootScreen()));
  });

  afterNavigate(() => main?.scrollTo({ top: 0 }));

  // Native page transitions; only the page content (view-transition-name: page) moves.
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

{#if !popout}<Ambient image={player.track?.album?.image ?? null} playing={!player.paused} />{/if}

{#if popout}
  {@render children()}
{:else if booting}
  <!-- app.html's loading screen covers this moment. -->
{:else if !account.open}
  <CarbonSignIn />
{:else if services.screen !== "app"}
  <ServiceGate />
{:else}
  <div class="app" class:rail={view.rail} class:lyrics={view.lyrics} class:compact={compact.on} inert={view.cinema}>
    <TitleBar />
    <Sidebar />
    <div class="stage">
      <main bind:this={main}>
        {#if session.error}
          <p class="banner" role="alert">
            {session.error}
            <button onclick={() => (session.error = null)}>Dismiss</button>
          </p>
        {/if}
        {#if session.signInPrompt}
          <p class="banner" role="status">
            {session.signInPrompt}
            <span class="banner-actions">
              <button onclick={() => session.reconsent()}>Sign in again</button>
              <button onclick={() => (session.signInPrompt = null)}>Later</button>
            </span>
          </p>
        {/if}
        {#if !redirect}{@render children()}{/if}
      </main>
      {#if view.queue}<QueuePanel onclose={() => (view.queue = false)} />{/if}
      <Toasts />
    </div>
    {#if view.lyrics}<LyricsPanel />{/if}
    <NowPlayingBar />
  </div>
  {#if view.cinema}<Cinema />{/if}
  {#if compact.on}<CompactPlayer />{/if}
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
  {#if dialogs.palette}<CommandPalette />{/if}
  <LibraryTools />
  {#if youtube.dialog}
    {#key youtube.dialog}<YtPlaylistDialog request={youtube.dialog} />{/key}
  {/if}
{/if}
<Tooltip />

<style>
  /* Chrome (title bar, sidebar, player bar) sits on the wallpaper; the stage is inset into it. */
  .app {
    --side: var(--sidebar-w);
    --aside: 0px;
    position: relative;
    z-index: 1;
    height: 100vh;
    display: grid;
    grid-template-columns: var(--side) minmax(0, 1fr) var(--aside);
    grid-template-rows: var(--titlebar-h) minmax(0, 1fr) var(--player-h);
    grid-template-areas:
      "title title title"
      "side stage lyrics"
      "player player player";
    color: var(--chrome-text);
  }

  .app :global(.titlebar) {
    grid-area: title;
  }

  /* Compact mode keeps the shell (and the page) as it was, out of sight. */
  .app.compact {
    display: none;
  }

  .app.rail {
    --side: var(--rail-w);
  }

  .app.lyrics {
    --aside: var(--lyrics-w);
  }

  .stage {
    grid-area: stage;
    position: relative;
    min-height: 0;
    margin-right: var(--inset);
    border-radius: var(--r-lg);
    background: var(--stage);
    box-shadow:
      0 0 0 1px var(--stage-edge),
      0 30px 80px -40px rgb(0 0 0 / 0.9);
    overflow: hidden;
    color: var(--text);
    container: stage / inline-size;
  }

  .app.lyrics .stage {
    margin-right: 0;
  }

  main {
    --page-x: 48px;
    height: 100%;
    overflow-y: auto;
    padding: 0 var(--page-x) var(--sp-6);
    scrollbar-gutter: stable;
    view-transition-name: page;
  }

  @container stage (max-width: 980px) {
    main {
      --page-x: var(--sp-5);
    }
  }

  /* Above page washes, which reach up behind it. */
  .banner {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin: var(--sp-4) 0 0;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
    border-radius: var(--r-md);
    background: var(--plate);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .banner button {
    height: 30px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--text);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .banner button:hover {
    background: var(--glass-hover);
  }

  .banner-actions {
    display: flex;
    gap: var(--sp-1);
  }
</style>
