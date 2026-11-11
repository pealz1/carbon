<script lang="ts" module>
  export type Source = "spotify" | "youtube" | "local";

  const SPOTIFY_PAGES = /^\/(search|library|liked|album|artist|playlist|carbon)(\/|$)/;

  /** The source a page belongs to; null for shared pages (settings, sound, now playing). */
  export function sourceOfPath(path: string): Source | null {
    if (path.startsWith("/youtube")) return "youtube";
    if (path.startsWith("/local")) return "local";
    return path === "/" || SPOTIFY_PAGES.test(path) ? "spotify" : null;
  }
</script>

<script lang="ts">
  // Spotify, YouTube Music or local files: which library the sidebar shows. The services stay
  // separate everywhere (queues, playlists, search), so this is a switch, not a filter.
  let { source }: { source: Source } = $props();

  const SOURCES: { id: Source; label: string; href: string }[] = [
    { id: "spotify", label: "Spotify", href: "/" },
    { id: "youtube", label: "YouTube", href: "/youtube" },
    { id: "local", label: "Local", href: "/local" },
  ];
</script>

<nav class="switch" aria-label="Music source">
  {#each SOURCES as s (s.id)}
    <a href={s.href} class:active={source === s.id} aria-current={source === s.id ? "true" : undefined}>{s.label}</a>
  {/each}
</nav>

<style>
  .switch {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    margin: var(--sp-3) var(--sp-1) 0;
    padding: 3px;
    border-radius: var(--r-pill);
    background: rgb(0 0 0 / 0.22);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35);
  }

  a {
    display: grid;
    place-items: center;
    height: 28px;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 650;
    letter-spacing: -0.01em;
    text-decoration: none;
    transition:
      color var(--dur-fast),
      background var(--dur-fast);
  }

  a:hover {
    color: var(--text);
    text-decoration: none;
  }

  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  a.active {
    background: var(--glass-active);
    color: var(--text);
    box-shadow:
      0 1px 0 0 var(--glass-edge-top) inset,
      0 4px 12px -6px rgb(0 0 0 / 0.6);
  }
</style>
