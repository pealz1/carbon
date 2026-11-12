<script lang="ts" module>
  // The last choice survives the panel re-reading the playlist after a sort.
  const last: { key: import("./order").SortKey; descending: boolean } = { key: "title", descending: false };
</script>

<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { formatDuration } from "$lib/format";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { toasts } from "$lib/toast.svelte";
  import { reorderSpotify, replaceCarbon } from "./apply";
  import { planMoves, restoreMoves, rowKeys, sortedOrder, type SortKey } from "./order";
  import type { EditableSource, Row } from "./rows";
  import { sourceKey, tools, type Undo } from "./tools.svelte";

  // Sort a playlist you own: pick a key, preview the new order, apply. Spotify playlists change
  // through range moves, so every song keeps its "date added"; the old order can be restored.
  let { source, rows, onchanged }: { source: EditableSource; rows: Row[]; onchanged: () => void } = $props();

  const PREVIEW = 40;
  const KEYS: { id: SortKey; label: string; ways: [string, string] }[] = [
    { id: "title", label: "Title", ways: ["A to Z", "Z to A"] },
    { id: "artist", label: "Artist", ways: ["A to Z", "Z to A"] },
    { id: "album", label: "Album", ways: ["A to Z", "Z to A"] },
    { id: "added", label: "Date added", ways: ["Oldest first", "Newest first"] },
    { id: "duration", label: "Length", ways: ["Shortest first", "Longest first"] },
    { id: "released", label: "Release date", ways: ["Oldest first", "Newest first"] },
  ];

  const spotify = $derived(source.kind === "playlist");
  // Carbon playlists don't store when a song was added or released.
  const keys = $derived(spotify ? KEYS : KEYS.filter((k) => k.id !== "added" && k.id !== "released"));
  // svelte-ignore state_referenced_locally
  let key = $state<SortKey>(source.kind === "playlist" || !["added", "released"].includes(last.key) ? last.key : "title");
  let descending = $state(last.descending);
  $effect(() => void Object.assign(last, { key, descending }));
  let busy = $state(false);
  let done = $state(0);
  let error = $state<string | null>(null);

  const order = $derived(sortedOrder(rows, key, descending));
  const moves = $derived(planMoves(rows.map((_, i) => i), order));
  const ways = $derived(KEYS.find((k) => k.id === key)!.ways);
  const undo = $derived(tools.undo[sourceKey(source)]);

  function detail(row: Row): string {
    if (key === "added") return row.addedAt ? new Date(row.addedAt).toLocaleDateString() : "";
    if (key === "duration") return row.durationMs ? formatDuration(row.durationMs) : "";
    if (key === "released") return row.releaseDate ?? "";
    return key === "album" ? row.album : "";
  }

  function remember(entry: Undo) {
    tools.undo = { ...tools.undo, [sourceKey(source)]: entry };
  }

  async function write(next: () => Promise<void>) {
    busy = true;
    done = 0;
    error = null;
    try {
      await next();
    } catch (e) {
      console.error("[tools] sort failed", e);
      error = describeError(e);
    } finally {
      busy = false;
      if (spotify) tools.version++;
      onchanged();
    }
  }

  const apply = () =>
    write(async () => {
      if (source.kind === "playlist") {
        remember({ kind: "spotify", keys: rowKeys(rows) });
        await reorderSpotify(source.id, moves, (n) => (done = n));
      } else {
        const playlist = carbonPlaylists.find(source.id);
        if (!playlist || playlist.items.length !== rows.length) throw new Error("The playlist changed. Open it again to sort it.");
        await replaceCarbon(source.id, order.map((i) => playlist.items[i]));
        remember({ kind: "carbon", items: playlist.items, updatedMs: carbonPlaylists.find(source.id)?.updatedMs ?? 0 });
      }
      toasts.show(`Sorted ${source.name}.`);
    });

  const restore = () =>
    write(async () => {
      if (!undo) return;
      if (undo.kind === "spotify" && source.kind === "playlist") {
        const back = restoreMoves(rowKeys(rows), undo.keys);
        if (!back) throw new Error("The playlist changed since it was sorted, so Carbon can't put the old order back.");
        await reorderSpotify(source.id, back, (n) => (done = n));
      } else if (undo.kind === "carbon") {
        if (carbonPlaylists.find(source.id)?.updatedMs !== undo.updatedMs) throw new Error("The playlist changed since it was sorted, so Carbon can't put the old order back.");
        await replaceCarbon(source.id, undo.items);
      }
      tools.undo = Object.fromEntries(Object.entries(tools.undo).filter(([k]) => k !== sourceKey(source)));
      toasts.show(`Put ${source.name} back in its old order.`);
    });
</script>

<div class="panel">
  <div class="controls">
    <div class="segmented" role="radiogroup" aria-label="Sort by">
      {#each keys as k (k.id)}
        <button role="radio" aria-checked={key === k.id} class:active={key === k.id} onclick={() => (key = k.id)}>{k.label}</button>
      {/each}
    </div>
    <div class="segmented" role="radiogroup" aria-label="Direction">
      {#each ways as way, i (way)}
        <button role="radio" aria-checked={descending === (i === 1)} class:active={descending === (i === 1)} onclick={() => (descending = i === 1)}>{way}</button>
      {/each}
    </div>
  </div>

  <p class="summary">
    {#if !moves.length}
      Already in this order.
    {:else if spotify}
      {moves.length} {moves.length === 1 ? "move" : "moves"} on Spotify. Every song keeps its date added.
    {:else}
      Preview of the new order.
    {/if}
  </p>

  <ol class="preview" aria-label="New order">
    {#each order.slice(0, PREVIEW) as from, at (from)}
      {@const row = rows[from]}
      <li class:moved={from !== at}>
        <span class="index tabular">{at + 1}</span>
        <span class="text">
          <span class="name">{row.name}</span>
          <span class="sub">{row.artists.join(", ")}</span>
        </span>
        <span class="detail tabular">{detail(row)}</span>
      </li>
    {/each}
  </ol>
  {#if rows.length > PREVIEW}<p class="fine">And {rows.length - PREVIEW} more.</p>{/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="actions">
    {#if undo}
      <button class="pill ghost" onclick={restore} disabled={busy}><Icon name="restore" size={16} />Restore previous order</button>
    {/if}
    <span class="spacer"></span>
    {#if busy && spotify}<span class="progress tabular" aria-live="polite">{done} of {moves.length}</span>{/if}
    <button class="pill accent" onclick={apply} disabled={busy || !moves.length}><Icon name="sort" size={16} />{busy ? "Sorting…" : "Sort playlist"}</button>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .summary {
    margin: 0;
    color: var(--text-muted);
  }

  .preview {
    max-height: min(40vh, 360px);
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .preview li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    height: 44px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text-muted);
  }

  .preview li:nth-child(odd) {
    background: var(--row-stripe);
  }

  .preview li.moved .name {
    color: var(--text);
  }

  .index {
    color: var(--text-faint);
    font-size: var(--fs-small);
    text-align: right;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .sub,
  .detail,
  .fine,
  .progress {
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .fine {
    margin: 0;
  }

  .error {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }

  .spacer {
    flex: 1;
  }
</style>
