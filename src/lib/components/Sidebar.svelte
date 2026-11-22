<script lang="ts">
  import {t} from "$lib/i18n/locale.svelte";
  import { page } from "$app/state";
  import { groupOf, isActive, sidebarSections } from "$lib/nav";
  import { prefs } from "$lib/preferences.svelte";
  import { serverSession } from "$lib/servers/session.svelte";
  import { services } from "$lib/services.svelte";
  import { session } from "$lib/session.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";
  import SidebarPlaylists from "./SidebarPlaylists.svelte";
  import YoutubePlaylists from "./YoutubePlaylists.svelte";

  const path = $derived(page.url.pathname);
  const sections = $derived(sidebarSections({ ...services.active, servers: serverSession.list.map((s) => s.kind) }));
  const rows = $derived(sections.flatMap((s) => s.items));
  const place = $derived(groupOf(path));
  // A page that belongs to the library (collections, bookmarks, podcasts) lights the Library row.
  const libraryRow = $derived(place === "library" && !rows.some((r) => isActive(r.href, path)) ? rows.find((r) => r.label === "Library")?.href : undefined);
  const name = $derived(prefs.value?.displayName.trim() || session.profile?.name || "");
</script>

<aside class="sidebar" class:rail={view.rail} aria-label="Sidebar">
  <!-- Search is a place too: every source's results, and the sources themselves. -->
  <a class="search pressable" class:active={path === "/search" || place === "search"} href="/search" aria-label="Search" title={view.rail ? "Search" : undefined}>
    <span class="label">Search</span>
    <Icon name="search" size={18} />
  </a>

  <div class="scroll">
    {#each sections as section (section.id)}
      {@const open = view.rail || !section.label || !view.closed.includes(section.id)}
      <section class="section">
        {#if section.label}
          <button class="section-head" aria-expanded={open} onclick={() => view.toggleSection(section.id)}>
            <span>{t(section.label)}</span>
            <span class="fold" class:closed={!open}><Icon name="down" size={14} /></span>
          </button>
        {/if}
        {#if open}
          <nav aria-label={section.label ? t(section.label) : t("Places")}>
            {#each section.items as item (item.href)}
              {@const active = isActive(item.href, path) || item.href === libraryRow}
              <a href={item.href} class="row nav pressable" class:active aria-current={active ? "page" : undefined} title={view.rail ? t(item.label) : undefined}>
                <span class="icon"><Icon name={item.icon} size={21} filled={item.icon === "heart" && active} /></span>
                <span class="name">{t(item.label)}</span>
              </a>
            {/each}
          </nav>
        {/if}
      </section>
    {/each}
    <SidebarPlaylists rail={view.rail} />
    {#if services.active.youtube}<YoutubePlaylists rail={view.rail} />{/if}
  </div>

  <!-- You: your listening (profile, top music, Wrapped, history) on the left, Settings on the right. -->
  <div class="you">
    <a href="/profile" class="profile pressable" class:active={place === "you"} aria-label="Your listening" title={view.rail ? "Your listening" : undefined}>
      {#if session.profile?.image}
        <img src={session.profile.image} alt="" width="26" height="26" class="avatar" />
      {:else if name}
        <span class="avatar initials">{name.slice(0, 1).toUpperCase()}</span>
      {:else}
        <span class="avatar initials"><Icon name="artist" size={15} /></span>
      {/if}
      <span class="name">{name || "You"}</span>
    </a>
    <a href="/settings" class="gear pressable" class:active={path === "/settings"} aria-label="Settings" title="Settings"><Icon name="settings" size={19} /></a>
  </div>
</aside>

<style>
  .sidebar {
    grid-area: side;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
    padding: var(--sp-1) var(--sp-2) var(--sp-2) var(--sp-3);
    color: var(--chrome-text);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 38px;
    padding: 0 var(--sp-3) 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--chrome-field);
    box-shadow: var(--rim);
    color: var(--chrome-text-muted);
    font-size: var(--fs-body);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
  }

  .search:hover,
  .search.active {
    background: var(--chrome-active);
    box-shadow: var(--rim-hover);
    color: var(--chrome-text);
    text-decoration: none;
  }

  .search .label {
    flex: 1;
    text-align: left;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-right: calc(var(--sp-2) * -1);
    padding-right: var(--sp-1);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  /* Section labels: quiet, collapsible, never shouting. Shared with SidebarPlaylists. */
  .sidebar :global(.section-head) {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--chrome-text-muted);
    font-size: var(--fs-caption);
    font-weight: 600;
    transition:
      color var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .sidebar :global(.section-head:hover) {
    color: var(--chrome-text);
  }

  .sidebar :global(.fold) {
    display: grid;
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .sidebar :global(.fold.closed) {
    transform: rotate(-90deg);
  }

  /* Rows: nav items and playlists. */
  .sidebar :global(.row) {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 40px;
    padding: 0 var(--sp-2) 0 calc(var(--sp-3) + var(--depth, 0) * var(--sp-3));
    border-radius: var(--r-lg);
    color: var(--chrome-text);
    font-size: var(--fs-body);
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .sidebar :global(.row:hover) {
    background: var(--chrome-hover);
    text-decoration: none;
  }

  /* The page you're on: a lit, raised row that settles in with a little spring. */
  .sidebar :global(.row.active) {
    background: var(--chrome-active);
    box-shadow: var(--rim);
    animation: row-on var(--dur-spring) var(--ease-spring);
  }

  @keyframes row-on {
    from {
      scale: 0.96;
    }
  }

  .nav {
    font-weight: 600;
  }

  /* Icons in white at near full strength; they swell a little under the pointer. */
  .icon {
    display: grid;
    width: 26px;
    place-items: center;
    color: var(--chrome-text);
    opacity: 0.88;
    transition:
      scale var(--dur-spring) var(--ease-spring),
      opacity var(--dur-fast);
  }

  .row:hover .icon {
    scale: 1.12;
    opacity: 1;
  }

  .nav.active .icon {
    color: var(--accent);
    opacity: 1;
  }

  .sidebar :global(.name) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .you {
    display: flex;
    gap: var(--sp-1);
  }

  .profile,
  .gear {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 42px;
    border-radius: var(--r-md);
    background: var(--chrome-hover);
    font-weight: 600;
    text-decoration: none;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
  }

  .profile {
    flex: 1;
    min-width: 0;
    padding: 0 var(--sp-3) 0 var(--sp-2);
  }

  .gear {
    flex: none;
    width: 42px;
    justify-content: center;
    color: var(--chrome-text-muted);
  }

  .profile:hover,
  .profile.active,
  .gear:hover,
  .gear.active {
    background: var(--chrome-active);
    box-shadow: var(--rim);
    color: var(--chrome-text);
    text-decoration: none;
  }

  .gear > :global(svg) {
    transition: rotate var(--dur-slow) var(--ease-out);
  }

  .gear:hover > :global(svg) {
    rotate: 60deg;
  }

  .avatar {
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .initials {
    display: grid;
    place-items: center;
    background: var(--chrome-active);
    font-size: var(--fs-caption);
    font-weight: 700;
  }

  /* Rail: icons and artwork only; names move to tooltips. */
  .rail {
    padding-inline: var(--sp-2);
  }

  .rail .search {
    justify-content: center;
    padding: 0;
  }

  .rail .search .label,
  .rail :global(.section-head) {
    display: none;
  }

  .rail .you {
    flex-direction: column;
  }

  .rail .gear {
    width: auto;
  }

  /* Names leave the rail visually but stay as each row's accessible name. */
  .rail :global(.name) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rail :global(.row),
  .rail .profile {
    justify-content: center;
    padding: 0;
  }

  .rail .scroll {
    gap: var(--sp-2);
    margin-right: 0;
    padding-right: 0;
  }

  .rail .section + .section,
  .rail :global(.playlists) {
    padding-top: var(--sp-2);
    border-top: 1px solid var(--chrome-hover);
  }
</style>
