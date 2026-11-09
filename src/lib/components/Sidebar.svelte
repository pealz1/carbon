<script lang="ts">
  import { page } from "$app/state";
  import { player } from "$lib/player.svelte";
  import { session } from "$lib/session.svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import { specular } from "$lib/liquid";

  const NAV: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/search", label: "Search", icon: "search" },
    { href: "/library", label: "Library", icon: "library" },
  ];

  const path = $derived(page.url.pathname);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
</script>

<aside class="sidebar liquid" use:specular>
  <div class="brand" data-tauri-drag-region>
    <Logo size={26} />
    <span class="wordmark">carbon</span>
  </div>

  <nav aria-label="Main">
    {#each NAV as item (item.href)}
      <a href={item.href} class="nav-item" class:active={isActive(item.href)} aria-current={isActive(item.href) ? "page" : undefined}>
        <Icon name={item.icon} size={19} />
        {item.label}
      </a>
    {/each}
  </nav>

  <section class="playlists" aria-label="Your playlists">
    <h2 class="eyebrow">Your music</h2>
    <a href="/liked" class="row" class:active={path === "/liked"}>
      <span class="liked-tile"><Icon name="heart" size={15} filled /></span>
      <span class="name">Liked Songs</span>
    </a>
    {#each session.playlists as playlist (playlist.id)}
      <a href="/playlist/{playlist.id}" class="row" class:active={path === `/playlist/${playlist.id}`}>
        {#if playlist.image}
          <img src={playlist.image} alt="" width="32" height="32" loading="lazy" decoding="async" />
        {:else}
          <span class="blank-tile"></span>
        {/if}
        <span class="name">{playlist.name}</span>
        {#if player.contextUri === playlist.uri && !player.paused}
          <span class="live" aria-label="Playing"></span>
        {/if}
      </a>
    {/each}
  </section>

  {#if session.profile}
    <footer class="profile">
      {#if session.profile.image}
        <img src={session.profile.image} alt="" width="28" height="28" class="avatar" />
      {:else}
        <span class="avatar initials">{session.profile.name.slice(0, 1).toUpperCase()}</span>
      {/if}
      <span class="name">{session.profile.name}</span>
      <a href="/settings" class="signout" class:active={path === "/settings"} aria-label="Settings" title="Settings">
        <Icon name="settings" size={18} />
      </a>
    </footer>
  {/if}
</aside>

<style>
  .sidebar {
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: var(--sp-2) 0 var(--sp-2) var(--sp-2);
    border-radius: var(--r-lg);
    padding: 0 var(--sp-2) var(--sp-2);
  }

  .brand {
    height: var(--titlebar-h);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) 0;
  }

  .wordmark {
    font-family: var(--font-display);
    font-weight: 650;
    font-size: 1.2rem;
    letter-spacing: -0.04em;
    pointer-events: none;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: var(--sp-3) 0 var(--sp-4);
  }

  .nav-item,
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    border-radius: var(--r-md);
    color: var(--text-muted);
    text-decoration: none;
    transition: background var(--dur-fast), color var(--dur-fast);
  }

  .nav-item {
    height: 40px;
    padding: 0 var(--sp-3);
    font-weight: 600;
  }

  .nav-item:hover,
  .row:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .nav-item.active,
  .row.active {
    background: var(--glass-active);
    color: var(--text);
    box-shadow: 0 1px 0 0 var(--glass-edge-top) inset;
  }

  .nav-item.active :global(svg) {
    color: var(--accent);
  }

  .playlists {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .playlists h2 {
    padding: 0 var(--sp-3) var(--sp-2);
  }

  .row {
    padding: 5px var(--sp-2);
    font-size: var(--fs-small);
  }

  .row img,
  .blank-tile,
  .liked-tile {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--r-sm);
    object-fit: cover;
  }

  .blank-tile {
    background: var(--glass-hover);
  }

  .liked-tile {
    display: grid;
    place-items: center;
    color: var(--accent-ink);
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live {
    width: 7px;
    height: 7px;
    margin-right: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .profile {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-2) 0;
    margin-top: var(--sp-2);
    border-top: 1px solid var(--glass-edge);
    font-size: var(--fs-small);
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--r-pill);
    object-fit: cover;
  }

  .initials {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    font-weight: 700;
  }

  .signout {
    color: var(--text-faint);
    padding: var(--sp-1);
    border-radius: var(--r-sm);
  }

  .signout:hover {
    color: var(--text);
    background: var(--glass-hover);
  }
</style>
