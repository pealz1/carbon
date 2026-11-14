<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { momentsOf, pagesOf, type Bookmark } from "$lib/bookmarks/bookmarks";
  import { bookmarks } from "$lib/bookmarks/bookmarks.svelte";
  import { formatDuration } from "$lib/format";
  import { playAt } from "$lib/history/play";
  import { trackOf } from "$lib/history/song";
  import { toasts } from "$lib/toast.svelte";

  // Pages and moments kept for later, without following or liking anything. Bookmarks are made
  // from the "…" menu of an album, artist, playlist or song.
  const pages = $derived(pagesOf(bookmarks.list));
  const moments = $derived(momentsOf(bookmarks.list));

  onMount(() => void bookmarks.load());

  const count = (n: number) => (n === 1 ? "1 bookmark" : `${n.toLocaleString()} bookmarks`);

  const playMoment = (b: Bookmark) =>
    playAt(trackOf({ uri: b.target, title: b.title, artists: b.subtitle ? [b.subtitle] : [], album: "", image: b.image, durationMs: b.durationMs }), b.positionMs);

  async function remove(bookmark: Bookmark) {
    if (await bookmarks.remove(bookmark)) toasts.show(`Removed the bookmark for ${bookmark.title}.`, "info", { label: "Undo", run: () => bookmarks.add(bookmark) });
  }
</script>

<header class="page-head">
  <div class="title">
    <h1>Bookmarks</h1>
    <p class="status" aria-live="polite">{bookmarks.loaded ? `${count(bookmarks.list.length)}, kept on this PC.` : ""}</p>
  </div>
</header>

{#if bookmarks.error}
  <Status error={bookmarks.error} onretry={() => bookmarks.load()} />
{:else if !bookmarks.loaded}
  <Status loading />
{:else if !bookmarks.list.length}
  <Status empty="Nothing bookmarked yet. Open the “…” menu of an album, artist, playlist or song and choose Bookmark." />
{:else}
  {#if moments.length}
    <section>
      <h2>Moments</h2>
      <ul>
        {#each moments as b (b.target + b.positionMs)}
          <li>
            <button class="open" onclick={() => playMoment(b)} aria-label="Play {b.title} from {formatDuration(b.positionMs)}">
              {@render art(b)}
              <span class="text">
                <span class="name">{b.title}</span>
                <span class="about">{b.subtitle}</span>
              </span>
              <span class="at tabular"><Icon name="play" size={11} />{formatDuration(b.positionMs)}</span>
            </button>
            {@render removal(b)}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if pages.length}
    <section>
      <h2>Pages</h2>
      <ul>
        {#each pages as b (b.target)}
          <li>
            <a class="open" href={b.target}>
              {@render art(b)}
              <span class="text">
                <span class="name">{b.title}</span>
                <span class="about">{b.subtitle}</span>
              </span>
            </a>
            {@render removal(b)}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

{#snippet art(b: Bookmark)}
  {#if b.image}
    <img class:round={b.subtitle === "Artist"} src={b.image} alt="" width="48" height="48" loading="lazy" decoding="async" />
  {:else}
    <span class="blank"><Icon name={b.kind === "moment" ? "note" : "bookmark"} size={18} /></span>
  {/if}
{/snippet}

{#snippet removal(b: Bookmark)}
  <button class="remove" onclick={() => remove(b)} aria-label="Remove the bookmark for {b.title}" title="Remove bookmark">
    <Icon name="close" size={15} />
  </button>
{/snippet}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .status {
    margin: 0;
    min-height: 1.4em;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  section {
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  ul {
    list-style: none;
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 2px var(--sp-4);
  }

  li {
    display: flex;
    align-items: center;
    min-width: 0;
    border-radius: var(--r-md);
    transition: background var(--dur-fast);
  }

  li:hover,
  li:focus-within {
    background: var(--glass-hover);
  }

  .open {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    color: inherit;
    text-align: left;
    text-decoration: none;
  }

  img,
  .blank {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  img.round {
    border-radius: var(--r-pill);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    color: var(--text-faint);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name,
  .about {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .about {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  /* Where in the song the moment is: the one accent on the row. */
  .at {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 26px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    color: var(--accent);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .remove {
    flex: none;
    width: 32px;
    height: 32px;
    margin-right: var(--sp-1);
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-faint);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  .remove:hover {
    background: var(--glass-active);
    color: var(--text);
  }
</style>
