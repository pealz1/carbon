<script lang="ts">
  import { page } from "$app/state";
  import { hold } from "$lib/hold";
  import { menu } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import type { Card } from "$lib/spotify/types";
  import { view } from "$lib/view.svelte";
  import { ytCardMenu } from "$lib/youtube/menus";
  import { youtube } from "$lib/youtube/session.svelte";
  import Icon from "./Icon.svelte";

  // The sidebar's YouTube Music playlists (your library, signed in). Styled by the sidebar's shared
  // row and section rules, like SidebarPlaylists.
  const SECTION = "youtube-playlists";
  let { rail }: { rail: boolean } = $props();

  const path = $derived(page.url.pathname);
  const open = $derived(rail || !view.closed.includes(SECTION));
  const hrefOf = (id: string) => `/youtube/playlist/${encodeURIComponent(id)}`;
  const holdFor = (playlist: Card) => ({ onhold: (at: { x: number; y: number }, node: HTMLElement) => menu.openAt(at.x, at.y, ytCardMenu(playlist), node) });
</script>

{#if youtube.signedIn}
  <section class="playlists" aria-label="YouTube Music playlists">
    <div class="head">
      <button class="section-head" aria-expanded={open} onclick={() => view.toggleSection(SECTION)}>
        <span>YouTube Music playlists</span>
        <span class="fold" class:closed={!open}><Icon name="down" size={14} /></span>
      </button>
      <button class="tool" onclick={() => (youtube.dialog = { mode: "create", videoIds: [] })} aria-label="New YouTube Music playlist" title="New YouTube Music playlist">
        <Icon name="plus" size={16} />
      </button>
    </div>
    {#if open}
      {#each youtube.editable as playlist (playlist.id)}
        <a
          href={hrefOf(playlist.id)}
          class="row pressable"
          class:active={path === hrefOf(playlist.id)}
          title={rail ? playlist.title : undefined}
          oncontextmenu={(e) => menu.open(e, ytCardMenu(playlist))}
          use:hold={holdFor(playlist)}
        >
          {#if playlist.image}
            <img src={playlist.image} alt="" width="24" height="24" loading="lazy" decoding="async" draggable="false" />
          {:else}
            <span class="tile"><Icon name="note" size={13} /></span>
          {/if}
          <span class="name">{playlist.title}</span>
          {#if player.contextUri === playlist.uri && !player.paused}<span class="live" aria-label="Playing"></span>{/if}
        </a>
      {/each}
    {/if}
  </section>
{/if}

<style>
  .playlists {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .head .section-head {
    flex: 1;
  }

  .tool {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    color: var(--chrome-text-muted);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .head:hover .tool,
  .tool:focus-visible {
    opacity: 1;
  }

  .tool:hover {
    color: var(--chrome-text);
    background: var(--chrome-hover);
  }

  .live {
    width: 6px;
    height: 6px;
    margin-right: 2px;
    border-radius: var(--r-pill);
    background: var(--accent);
  }

  .row img,
  .tile {
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .tile {
    display: grid;
    place-items: center;
    background: var(--chrome-field);
    color: var(--chrome-text-muted);
  }

  :global(.sidebar.rail) .head .tool {
    display: none;
  }
</style>
