<script lang="ts">
  import { t } from "$lib/i18n/locale.svelte";
  import { hubItems, type NavItem } from "$lib/nav";
  import { serverSession } from "$lib/servers/session.svelte";
  import { services } from "$lib/services.svelte";
  import Icon from "./Icon.svelte";

  // A page of tiles for what the sidebar folds away: each tile its own colour, lifting toward the
  // pointer, arriving one after another.
  let { hub, title, lede }: { hub: NonNullable<NavItem["hub"]>; title: string; lede: string } = $props();
  const items = $derived(hubItems(hub, { ...services.active, servers: serverSession.list.map((s) => s.kind) }));
</script>

<header class="head">
  <h1>{title}</h1>
  <p>{t(lede)}</p>
</header>

<ul class="tiles">
  {#each items as item, i (item.href)}
    <li style="--hue: {item.hue ?? 100}; --i: {i}">
      <a class="tile" href={item.href}>
        <span class="icon"><Icon name={item.icon} size={22} /></span>
        <span class="name">{t(item.label)}</span>
        {#if item.blurb}<span class="blurb">{t(item.blurb)}</span>{/if}
        <span class="go" aria-hidden="true"><Icon name="forward" size={16} /></span>
      </a>
    </li>
  {/each}
</ul>

<style>
  .head {
    margin: var(--sp-4) 0 var(--sp-5);
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 800;
  }

  .head p {
    max-width: 60ch;
    margin: var(--sp-2) 0 0;
    color: var(--text-muted);
    font-size: var(--fs-lead);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The first tile spans two columns where there's room, so the grid has a lead. */
  @media (min-width: 900px) {
    .tiles li:first-child {
      grid-column: span 2;
    }

    .tiles li:first-child .tile {
      min-height: 100%;
    }

    .tiles li:first-child .icon {
      width: 56px;
      height: 56px;
    }
  }

  li {
    animation: tile-in 420ms var(--ease-spring) backwards;
    animation-delay: calc(var(--i) * 45ms);
  }

  .tile {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 150px;
    padding: var(--sp-4);
    overflow: hidden;
    border-radius: var(--r-xl);
    background: var(--plate);
    box-shadow:
      inset 0 1px 0 rgb(var(--tint) / 0.08),
      inset 0 0 0 1px var(--glass-edge);
    text-decoration: none;
    transition:
      transform var(--dur-med) var(--ease-spring),
      box-shadow var(--dur-med);
  }

  /* The tile's colour, pooled in a corner and brighter on hover. */
  .tile::before {
    content: "";
    position: absolute;
    inset: -40% -20% auto auto;
    z-index: -1;
    width: 75%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(closest-side, oklch(62% 0.16 var(--hue) / 0.42), transparent);
    opacity: 0.55;
    transition:
      opacity var(--dur-med),
      transform var(--dur-slow) var(--ease-out);
  }

  .tile:hover {
    text-decoration: none;
    transform: translateY(-3px);
    box-shadow:
      inset 0 1px 0 rgb(var(--tint) / 0.12),
      inset 0 0 0 1px oklch(70% 0.14 var(--hue) / 0.45),
      0 18px 40px -20px oklch(40% 0.14 var(--hue) / 0.9);
  }

  .tile:hover::before {
    opacity: 1;
    transform: scale(1.15);
  }

  .icon {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    margin-bottom: auto;
    border-radius: var(--r-lg);
    background: oklch(62% 0.15 var(--hue) / 0.22);
    color: oklch(85% 0.1 var(--hue));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12);
  }

  :global([data-theme="light"]) .icon {
    color: oklch(42% 0.14 var(--hue));
  }

  .name {
    margin-top: var(--sp-4);
    font-size: var(--fs-lead);
    font-weight: 750;
  }

  .blurb {
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.4;
  }

  .go {
    position: absolute;
    top: var(--sp-4);
    right: var(--sp-4);
    color: var(--text-faint);
    opacity: 0;
    transform: translateX(-6px);
    transition:
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-out);
  }

  .tile:hover .go {
    opacity: 1;
    transform: none;
  }

  @keyframes tile-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.94);
    }
  }
</style>
