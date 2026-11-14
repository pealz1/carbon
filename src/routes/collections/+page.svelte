<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { countLabel } from "$lib/collections/collections";
  import { collections } from "$lib/collections/collections.svelte";

  // Named groups of albums, kept on this PC. Albums join one from their "…" menu.
  const COVERS = 4;

  onMount(() => void collections.load());

  async function create() {
    const id = await collections.createWith();
    if (id) void goto(`/collections/${id}`);
  }

  const count = (n: number) => (n === 1 ? "1 collection" : `${n} collections`);
</script>

<header class="page-head">
  <div class="title">
    <h1>Collections</h1>
    <p class="status" aria-live="polite">{collections.loaded ? `${count(collections.list.length)}, kept on this PC.` : ""}</p>
  </div>
  <button class="pill accent" onclick={create}><Icon name="plus" size={15} />New collection</button>
</header>

{#if collections.error}
  <Status error={collections.error} onretry={() => collections.load()} />
{:else if !collections.loaded}
  <Status loading />
{:else if !collections.list.length}
  <Status empty="No collections yet. Make one, then add albums to it from an album's “…” menu." />
{:else}
  <div class="grid">
    {#each collections.list as c (c.id)}
      <a class="tile" href="/collections/{c.id}">
        <!-- Up to four covers, each whole in its own square; never one cropped into another. -->
        <span class="covers" class:single={c.albums.length === 1}>
          {#each c.albums.slice(0, COVERS) as album (album.uri)}
            {#if album.image}
              <img src={album.image} alt="" width="150" height="150" loading="lazy" decoding="async" draggable="false" />
            {:else}
              <span class="blank"><Icon name="album" size={22} /></span>
            {/if}
          {:else}
            <span class="blank empty"><Icon name="stack" size={30} /></span>
          {/each}
        </span>
        <span class="name">{c.name}</span>
        <span class="count">{countLabel(c)}</span>
      </a>
    {/each}
  </div>
{/if}

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

  .page-head .pill {
    margin-left: auto;
    align-self: flex-end;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(180px, 16cqw, 248px), 1fr));
    gap: var(--sp-3);
    margin: 0 calc(var(--sp-2) * -1);
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2);
    border-radius: var(--r-lg);
    color: var(--text);
    text-decoration: none;
    transition: background var(--dur-fast);
  }

  .tile:hover,
  .tile:focus-visible {
    background: var(--glass-hover);
    text-decoration: none;
  }

  .tile:active {
    background: var(--glass-active);
  }

  .covers {
    aspect-ratio: 1;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: var(--sp-1);
    margin-bottom: var(--sp-3);
    padding: var(--sp-2);
    border-radius: var(--r-art);
    background: var(--plate);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
  }

  .covers.single,
  .covers:has(.empty) {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }

  .covers img,
  .blank {
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass);
    color: var(--text-faint);
  }

  .blank.empty {
    background: none;
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .count {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
