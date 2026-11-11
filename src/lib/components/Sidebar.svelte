<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { isActive, NAV_SECTIONS } from "$lib/nav";
  import { session } from "$lib/session.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";
  import SidebarPlaylists from "./SidebarPlaylists.svelte";

  const path = $derived(page.url.pathname);
</script>

<aside class="sidebar" class:rail={view.rail} aria-label="Sidebar">
  <button class="search" class:active={path === "/search"} onclick={() => goto("/search")} aria-label="Search" title={view.rail ? "Search (Ctrl K)" : undefined}>
    <span class="label">Search</span>
    <kbd>Ctrl K</kbd>
    <Icon name="search" size={16} />
  </button>

  <div class="scroll">
    {#each NAV_SECTIONS as section (section.id)}
      {@const open = view.rail || !view.closed.includes(section.id)}
      <section class="section">
        <button class="section-head" aria-expanded={open} onclick={() => view.toggleSection(section.id)}>
          <span>{section.label}</span>
          <span class="fold" class:closed={!open}><Icon name="down" size={14} /></span>
        </button>
        {#if open}
          <nav aria-label={section.label}>
            {#each section.items as item (item.href)}
              {@const active = isActive(item.href, path)}
              <a href={item.href} class="row nav pressable" class:active aria-current={active ? "page" : undefined} title={view.rail ? item.label : undefined}>
                <span class="icon"><Icon name={item.icon} size={18} filled={item.icon === "heart" && active} /></span>
                <span class="name">{item.label}</span>
              </a>
            {/each}
          </nav>
        {/if}
      </section>
    {/each}
    <SidebarPlaylists rail={view.rail} />
  </div>

  {#if session.profile}
    <a href="/settings" class="profile pressable" class:active={path === "/settings"} aria-label="Settings for {session.profile.name}" title={view.rail ? "Settings" : undefined}>
      {#if session.profile.image}
        <img src={session.profile.image} alt="" width="26" height="26" class="avatar" />
      {:else}
        <span class="avatar initials">{session.profile.name.slice(0, 1).toUpperCase()}</span>
      {/if}
      <span class="name">{session.profile.name}</span>
      <span class="gear"><Icon name="settings" size={17} /></span>
    </a>
  {/if}
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
    height: 36px;
    padding: 0 var(--sp-3) 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--chrome-field);
    color: var(--chrome-text-muted);
    font-size: var(--fs-body);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .search:hover,
  .search.active {
    background: var(--chrome-active);
    color: var(--chrome-text);
  }

  .search .label {
    flex: 1;
    text-align: left;
  }

  kbd {
    padding: 1px 6px;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--chrome-field);
    font-family: inherit;
    font-size: var(--fs-micro);
    font-weight: 600;
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
    scrollbar-width: thin;
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
      transform var(--dur-med) var(--ease-spring);
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
    min-height: 36px;
    padding: 0 var(--sp-2) 0 calc(var(--sp-3) + var(--depth, 0) * var(--sp-3));
    border-radius: var(--r-md);
    color: var(--chrome-text);
    font-size: var(--fs-body);
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  .sidebar :global(.row:hover) {
    background: var(--chrome-hover);
    text-decoration: none;
  }

  .sidebar :global(.row.active) {
    background: var(--chrome-active);
  }

  .nav {
    font-weight: 600;
  }

  .icon {
    display: grid;
    width: 24px;
    place-items: center;
    color: var(--chrome-text-muted);
  }

  .nav.active .icon {
    color: var(--accent);
  }

  .sidebar :global(.name) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 42px;
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border-radius: var(--r-md);
    background: var(--chrome-hover);
    font-weight: 600;
    text-decoration: none;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .profile:hover,
  .profile.active {
    background: var(--chrome-active);
    text-decoration: none;
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

  .gear {
    display: grid;
    color: var(--chrome-text-muted);
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
  .rail kbd,
  .rail :global(.section-head),
  .rail :global(.name),
  .rail .gear {
    display: none;
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
