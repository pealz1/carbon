<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { resource } from "$lib/resource.svelte";
  import type { ServerLibrary } from "$lib/servers/types";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";
  import { pageHref } from "$lib/youtube/uri";

  // Every artist on the server, as a plain index: a library of thousands stays quick to scan and
  // to filter, which a wall of artwork would not be.
  let { library, kind }: { library: ServerLibrary; kind: ServerKind } = $props();
  const artists = resource(() => library.artists());
  let filter = $state("");
  const shown = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    const all = artists.data ?? [];
    return needle ? all.filter((a) => a.title.toLowerCase().includes(needle)) : all;
  });
</script>

<header class="page-head">
  <div class="title">
    <a class="back" href="/server/{kind}"><Icon name="back" size={14} />{SERVER_NAMES[kind]}</a>
    <h1>Artists</h1>
  </div>
  <input class="input" bind:value={filter} placeholder="Filter artists" aria-label="Filter artists" spellcheck="false" />
</header>

{#if artists.loading && !artists.data}
  <Status loading />
{:else if artists.error}
  <Status error={artists.error} onretry={artists.reload} />
{:else if shown.length}
  <ul>
    {#each shown as artist (artist.id)}
      <li><a href={pageHref("artist", artist)}><span class="name">{artist.title}</span><span class="count">{artist.subtitle}</span></a></li>
    {/each}
  </ul>
{:else}
  <Status empty={filter.trim() ? "No artist matches that." : "This server has no artists yet."} />
{/if}

<style>
  .page-head {
    align-items: flex-end;
    justify-content: space-between;
  }

  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .back:hover {
    color: var(--text);
  }

  .input {
    width: min(280px, 100%);
  }

  ul {
    list-style: none;
    margin: 0 calc(var(--sp-3) * -1);
    padding: 0;
    columns: 260px;
    column-gap: var(--sp-5);
  }

  li {
    break-inside: avoid;
  }

  li a {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    transition: background var(--dur-fast);
  }

  li a:hover,
  li a:focus-visible {
    background: var(--glass-hover);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .count {
    flex: none;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }
</style>
