<script lang="ts">
  // Settings: categories on the left, one shown at a time and chosen in the URL
  // (/settings?section=appearance), and a search that lists matching rows from all of them.
  import { tick } from "svelte";
  import { afterNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import AccessibilityPanel from "$lib/components/AccessibilityPanel.svelte";
  import DesktopPanel from "$lib/components/DesktopPanel.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import ListenbrainzPanel from "$lib/components/ListenbrainzPanel.svelte";
  import LyricsSettings from "$lib/components/LyricsSettings.svelte";
  import PlaybackPanel from "$lib/components/PlaybackPanel.svelte";
  import RemotePanel from "$lib/components/RemotePanel.svelte";
  import ServersPanel from "$lib/components/ServersPanel.svelte";
  import ServicesPanel from "$lib/components/ServicesPanel.svelte";
  import YoutubePanel from "$lib/components/YoutubePanel.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { isMac } from "$lib/platform";
  import { prefs } from "$lib/preferences.svelte";
  import { services } from "$lib/services.svelte";
  import AccountSettings from "$lib/settings/AccountSettings.svelte";
  import AppearanceSettings from "$lib/settings/AppearanceSettings.svelte";
  import { CATEGORIES, categoryHref, categoryOf } from "$lib/settings/categories";
  import Category from "$lib/settings/Category.svelte";
  import ConnectionTest from "$lib/settings/ConnectionTest.svelte";
  import DataSettings from "$lib/settings/DataSettings.svelte";
  import { provideIndex, type SettingEntry } from "$lib/settings/index.svelte";
  import IntegrationsSettings from "$lib/settings/IntegrationsSettings.svelte";
  import { matchSettings } from "$lib/settings/search";
  import SearchResults from "$lib/settings/SearchResults.svelte";
  import SoundSettings from "$lib/settings/SoundSettings.svelte";

  const FIND_KEYS = isMac ? "⌘F" : "Ctrl F";
  const FOUND_MS = 1600;

  const index = provideIndex();
  let query = $state("");
  let field = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();

  const section = $derived(categoryOf(page.url));
  const searching = $derived(query.trim() !== "");
  // The categories sit in the page in their own order, so the first row found is the first one shown.
  const found = $derived(searching ? matchSettings(index.rows, query) : []);

  /** Scrolls to a row and washes it with the accent for a moment (Row draws the wash). */
  function reveal(row: HTMLElement) {
    const { motion, effects } = document.documentElement.dataset;
    row.scrollIntoView({ block: "center" });
    row.querySelector<HTMLElement>("input, select, button, a[href]")?.focus({ preventScroll: true });
    if (motion === "none" || effects === "minimal") return;
    row.animate({ opacity: [1, 1, 0], offset: [0, 0.3, 1] }, { duration: FOUND_MS, easing: "ease-out", pseudoElement: "::after" });
  }

  /** Opens a search result. The search is cleared after the page has moved on, so the results (not the old category) are what fades out. */
  async function open(row: SettingEntry) {
    if (row.category !== section) await goto(categoryHref(row.category), { replace: true, reset: false });
    query = "";
    await tick();
    requestAnimationFrame(() => reveal(row.el));
  }

  // Choosing a category ends a search. Links from elsewhere (/settings#servers) land on their
  // group, a frame later because the layout scrolls every page to the top after a navigation.
  afterNavigate(() => {
    query = "";
    const anchor = page.url.hash.slice(1);
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }));
  });

  // On a narrow stage the categories are one scrolling line: keep the current one in it.
  $effect(() => {
    list?.querySelector(`[href="${categoryHref(section)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  function onkeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "f" || dialogs.anyOpen) return;
    event.preventDefault();
    field?.focus();
    field?.select();
  }

  function onsearchkey(event: KeyboardEvent) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      query = "";
    } else if (event.key === "Enter" && found.length) {
      void open(found[0]);
    }
  }

  /** A mouse wheel moves the line of categories sideways; the column it is on a wide stage scrolls as usual. */
  function sideways(event: WheelEvent & { currentTarget: HTMLElement }) {
    const line = event.currentTarget;
    if (line.scrollWidth <= line.clientWidth || !event.deltaY || event.shiftKey) return;
    line.scrollLeft += event.deltaY;
    event.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="settings">
  <aside class="rail">
    <h1>Settings</h1>
    <label class="search">
      <Icon name="search" size={16} />
      <input bind:this={field} bind:value={query} onkeydown={onsearchkey} type="search" class="input" placeholder="Search settings" aria-label="Search settings" spellcheck="false" autocomplete="off" />
      {#if !query}<kbd aria-hidden="true">{FIND_KEYS}</kbd>{/if}
    </label>
    <nav bind:this={list} aria-label="Settings categories" onwheel={sideways}>
      {#each CATEGORIES as category (category.id)}
        {@const current = !searching && category.id === section}
        <a
          href={categoryHref(category.id)}
          class="category pressable"
          class:current
          aria-current={current ? "page" : undefined}
          data-sveltekit-replacestate
          data-sveltekit-reset="false"
        >
          <Icon name={category.icon} size={18} />
          <span>{t(category.label)}</span>
        </a>
      {/each}
    </nav>
  </aside>

  <div class="content">
    {#if prefs.error}<p class="warn" role="alert">{prefs.error}</p>{/if}

    {#if searching}<SearchResults rows={found} {query} onopen={open} />{/if}

    {#if prefs.value}
      <div hidden={searching}>
        <Category id="account" current={section}><AccountSettings /></Category>
        <Category id="appearance" current={section}><AppearanceSettings /></Category>
        <Category id="playback" current={section}><PlaybackPanel /></Category>
        <Category id="lyrics" current={section}><LyricsSettings /></Category>
        <Category id="sound" current={section}><SoundSettings /></Category>
        <Category id="services" current={section}>
          <ServicesPanel />
          {#if services.active.youtube}<YoutubePanel />{/if}
          <ServersPanel />
          <ConnectionTest />
        </Category>
        <Category id="integrations" current={section}>
          <IntegrationsSettings />
          <ListenbrainzPanel />
          <RemotePanel />
        </Category>
        <Category id="desktop" current={section}><DesktopPanel /></Category>
        <Category id="accessibility" current={section}><AccessibilityPanel /></Category>
        <Category id="data" current={section}><DataSettings /></Category>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 232px minmax(0, 720px);
    column-gap: var(--sp-6);
    align-items: start;
  }

  /* The list keeps its place while a category scrolls, and while the page glides to the next one:
     its own view-transition-name takes it out of the `page` transition (app.css). */
  .rail {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-height: calc(100vh - var(--titlebar-h) - var(--player-h) - var(--inset) * 2);
    padding: var(--sp-6) 0 var(--sp-4);
    view-transition-name: settings-rail;
  }

  /* Arriving at Settings and leaving it, the list glides with the page. */
  ::view-transition-old(settings-rail):only-child {
    animation: vt-out 140ms var(--ease-out) both;
  }

  ::view-transition-new(settings-rail):only-child {
    animation: vt-in 300ms var(--ease-out) both;
  }

  h1 {
    padding: 0 var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 800;
    line-height: 40px;
  }

  .search {
    position: relative;
    display: block;
    flex: none;
  }

  .search :global(svg) {
    position: absolute;
    top: 50%;
    left: var(--sp-3);
    translate: 0 -50%;
    color: var(--text-faint);
    pointer-events: none;
  }

  .search .input {
    width: 100%;
    padding-left: calc(var(--sp-5) + var(--sp-2));
  }

  kbd {
    position: absolute;
    top: 50%;
    right: var(--sp-3);
    translate: 0 -50%;
    color: var(--text-faint);
    font-family: inherit;
    font-size: var(--fs-micro);
    font-weight: 600;
    pointer-events: none;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    /* Room for the focus ring inside the scrolling box. */
    margin: -3px;
    padding: 3px;
    overflow-y: auto;
  }

  .category {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-3);
    min-height: 38px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--text-muted);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  .category:hover {
    background: var(--glass-hover);
    color: var(--text);
    text-decoration: none;
  }

  .category.current {
    background: var(--glass-active);
    box-shadow: var(--rim);
    color: var(--text);
  }

  .category.current :global(svg) {
    color: var(--accent);
  }

  .content {
    min-width: 0;
    padding-top: var(--sp-6);
  }

  .warn {
    margin: 0 0 var(--sp-4);
    color: var(--warning);
    font-size: var(--fs-small);
  }

  /* A narrow stage: the list becomes a line of pills above the content, still in reach as it scrolls. */
  @container stage (max-width: 900px) {
    .settings {
      grid-template-columns: minmax(0, 1fr);
    }

    .rail {
      flex-flow: row wrap;
      align-items: center;
      gap: var(--sp-2) var(--sp-4);
      max-height: none;
      margin: 0 calc(var(--page-x) * -1);
      padding: var(--sp-4) var(--page-x) var(--sp-3);
      background: var(--stage);
      box-shadow: 0 1px 0 var(--stage-edge);
    }

    h1 {
      padding: 0;
      line-height: 36px;
    }

    .search {
      flex: 1 1 200px;
      max-width: 320px;
      margin-left: auto;
    }

    nav {
      flex: 1 0 100%;
      flex-direction: row;
      gap: var(--sp-2);
      padding-right: var(--sp-5);
      overflow: auto hidden;
      scrollbar-width: none;
      /* The line fades out where more of it waits to the right. */
      mask-image: linear-gradient(to right, #000 calc(100% - var(--sp-5)), transparent);
    }

    .category {
      gap: var(--sp-2);
      min-height: 34px;
      border-radius: var(--r-pill);
      background: var(--glass);
    }

    .category.current {
      background: var(--paper);
      box-shadow: none;
      color: var(--ink);
    }

    .category.current :global(svg) {
      color: inherit;
    }

    .content {
      padding-top: var(--sp-5);
    }
  }
</style>
