<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import MediaCard from "$lib/components/MediaCard.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Status from "$lib/components/Status.svelte";
  import { cardOf, countLabel } from "$lib/collections/collections";
  import { collections } from "$lib/collections/collections.svelte";
  import { toasts } from "$lib/toast.svelte";

  // One collection: its albums as cards. An album leaves through its own "…" menu
  // (Add to collection, then this collection's name).
  const collection = $derived(collections.byId(page.params.id ?? ""));
  let confirming = $state(false);

  onMount(() => void collections.load());

  async function remove() {
    const gone = collection;
    if (!gone || !(await collections.delete(gone.id))) return;
    confirming = false;
    toasts.show(`Deleted ${gone.name}.`);
    void goto("/collections", { replaceState: true });
  }
</script>

{#if collections.error}
  <Status error={collections.error} onretry={() => collections.load()} />
{:else if !collections.loaded}
  <Status loading />
{:else if !collection}
  <header class="page-head"><h1>Collections</h1></header>
  <Status empty="That collection isn't here anymore." />
  <a class="pill back" href="/collections">All collections</a>
{:else}
  <header class="page-head">
    <div class="title">
      <a class="up" href="/collections"><Icon name="back" size={13} />Collections</a>
      <h1>{collection.name}</h1>
      <p class="status">{countLabel(collection)}</p>
    </div>
    <div class="tools">
      <button class="pill" onclick={() => collections.renameWith(collection)}><Icon name="edit" size={15} />Rename</button>
      <button class="pill ghost danger" onclick={() => (confirming = true)}><Icon name="trash" size={15} />Delete…</button>
    </div>
  </header>

  {#if collection.albums.length}
    <div class="grid">
      {#each collection.albums as album (album.uri)}
        <MediaCard card={cardOf(album)} />
      {/each}
    </div>
  {:else}
    <Status empty="No albums yet. Open an album's “…” menu, choose Add to collection, then {collection.name}." />
  {/if}

  {#if confirming}
    <Modal title="Delete {collection.name}?" onclose={() => (confirming = false)}>
      <p class="confirm">The collection is removed from this PC. The albums themselves, and anything you saved on Spotify or YouTube Music, stay as they are.</p>
      <div class="actions">
        <button class="pill" onclick={() => (confirming = false)}>Keep it</button>
        <button class="pill danger solid" onclick={remove}>Delete collection</button>
      </div>
    </Modal>
  {/if}
{/if}

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .up {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    align-self: flex-start;
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .up:hover {
    color: var(--text);
  }

  .status {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-left: auto;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 14cqw, 232px), 1fr));
    gap: var(--sp-2);
    margin: 0 calc(var(--sp-2) * -1);
  }

  .back {
    display: flex;
    width: fit-content;
    margin: 0 auto;
  }

  .confirm {
    margin: 0 0 var(--sp-5);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }
</style>
