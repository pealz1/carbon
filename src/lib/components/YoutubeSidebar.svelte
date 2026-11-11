<script lang="ts">
  import { page } from "$app/state";
  import { menu } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import { LIKED_PLAYLIST } from "$lib/youtube/api";
  import { ytCardMenu } from "$lib/youtube/menus";
  import { youtube } from "$lib/youtube/session.svelte";
  import Icon from "./Icon.svelte";

  // The sidebar's YouTube Music library: Liked Music and your playlists (signed in only).
  const path = $derived(page.url.pathname);
  const hrefOf = (id: string) => `/youtube/playlist/${encodeURIComponent(id)}`;
</script>

<section class="playlists" aria-label="Your YouTube Music playlists">
  <div class="lib-head">
    <h2 class="eyebrow">YouTube Music</h2>
    {#if youtube.signedIn}
      <button class="tool" onclick={() => (youtube.dialog = { mode: "create", videoIds: [] })} aria-label="New YouTube Music playlist" title="New playlist">
        <Icon name="plus" size={17} />
      </button>
    {/if}
  </div>
  {#if youtube.signedIn}
    <a href={hrefOf(LIKED_PLAYLIST)} class="row" class:active={path === hrefOf(LIKED_PLAYLIST)}>
      <span class="liked-tile"><Icon name="heart" size={15} filled /></span>
      <span class="name">Liked Music</span>
    </a>
    {#each youtube.editable as playlist (playlist.id)}
      <a href={hrefOf(playlist.id)} class="row" class:active={path === hrefOf(playlist.id)} oncontextmenu={(e) => menu.open(e, ytCardMenu(playlist))}>
        {#if playlist.image}
          <img src={playlist.image} alt="" width="32" height="32" loading="lazy" decoding="async" draggable="false" />
        {:else}
          <span class="blank-tile"></span>
        {/if}
        <span class="name">{playlist.title}</span>
        {#if player.contextUri === playlist.uri && !player.paused}<span class="live" aria-label="Playing"></span>{/if}
      </a>
    {/each}
  {:else}
    <a href="/settings" class="row signin">
      <span class="blank-tile"><Icon name="signout" size={15} /></span>
      <span class="name">Sign in for your library</span>
    </a>
  {/if}
</section>

<style>
  .playlists {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .lib-head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0 var(--sp-1) var(--sp-2) var(--sp-3);
  }

  .lib-head h2 {
    flex: 1;
  }

  .tool {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-faint);
    transition:
      color var(--dur-fast),
      background var(--dur-fast);
  }

  .tool:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: 5px var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text-muted);
    font-size: var(--fs-small);
    text-decoration: none;
    transition:
      background var(--dur-fast),
      color var(--dur-fast);
  }

  .row:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .row.active {
    background: var(--glass-active);
    color: var(--text);
    box-shadow: 0 1px 0 0 var(--glass-edge-top) inset;
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
    display: grid;
    place-items: center;
    background: var(--glass-hover);
  }

  .signin .blank-tile {
    color: var(--accent);
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
</style>
