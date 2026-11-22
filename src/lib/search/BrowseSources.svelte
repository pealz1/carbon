<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { groupItems, type Running } from "$lib/nav";
  import { hueOf } from "./sources";

  // The way in to every page that lives under Search (nav.ts, group "search"), shown while nothing
  // is being searched for. A source that still needs setting up is listed too: its page is where
  // that happens. Each tile keeps its source's colour, pooled in a corner.
  let { running }: { running: Running } = $props();

  const pages = $derived(groupItems("search", running));
</script>

{#if pages.length}
  <section class="browse">
    <h2>Browse sources</h2>
    <ul>
      {#each pages as item, i (item.href)}
        <li style="--hue: {hueOf(item.href)}; --i: {i}">
          <a class="tile" href={item.href}>
            <span class="icon"><Icon name={item.icon} size={18} /></span>
            <span class="name">{t(item.label)}</span>
            <span class="go" aria-hidden="true"><Icon name="forward" size={14} /></span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    animation: tile-in 420ms var(--ease-spring) backwards;
    animation-delay: calc(var(--i) * 40ms);
  }

  .tile {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 76px;
    padding: var(--sp-3) var(--sp-4);
    overflow: hidden;
    border-radius: var(--r-lg);
    background: var(--plate);
    box-shadow:
      inset 0 1px 0 rgb(var(--tint) / 0.08),
      inset 0 0 0 1px var(--glass-edge);
    text-decoration: none;
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  /* The tile's colour, pooled in a corner and brighter on hover. */
  .tile::before {
    content: "";
    position: absolute;
    inset: -70% -15% auto auto;
    z-index: -1;
    width: 60%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(closest-side, oklch(62% 0.16 var(--hue) / 0.42), transparent);
    opacity: 0.5;
    transition:
      opacity var(--dur-med),
      transform var(--dur-slow) var(--ease-out);
  }

  .tile:hover,
  .tile:focus-visible {
    text-decoration: none;
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgb(var(--tint) / 0.12),
      inset 0 0 0 1px oklch(70% 0.14 var(--hue) / 0.45),
      0 14px 30px -18px oklch(40% 0.14 var(--hue) / 0.9);
  }

  .tile:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tile:hover::before,
  .tile:focus-visible::before {
    opacity: 1;
    transform: scale(1.15);
  }

  .icon {
    width: 38px;
    height: 38px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: oklch(62% 0.15 var(--hue) / 0.22);
    color: oklch(85% 0.1 var(--hue));
    box-shadow: inset 0 1px 0 rgb(var(--tint) / 0.12);
  }

  :global([data-theme="light"]) .icon {
    color: oklch(42% 0.14 var(--hue));
  }

  .name {
    min-width: 0;
    font-size: var(--fs-lead);
    font-weight: 700;
  }

  .go {
    margin-left: auto;
    color: var(--text-faint);
    opacity: 0;
    transform: translateX(-6px);
    transition:
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-out);
  }

  .tile:hover .go,
  .tile:focus-visible .go {
    opacity: 1;
    transform: none;
  }

  @keyframes tile-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
  }
</style>
