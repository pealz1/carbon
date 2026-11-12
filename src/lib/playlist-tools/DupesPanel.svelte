<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { toasts } from "$lib/toast.svelte";
  import { putBack, PutBackError, removeSpotify, replaceCarbon } from "./apply";
  import { findDuplicates, planRemoval, type Removal } from "./order";
  import type { EditableSource, Row } from "./rows";
  import { tools } from "./tools.svelte";

  // Repeats in a playlist you own: the same song twice (same link), or the same recording on
  // another release (same ISRC). The first copy always stays; the listener picks what goes.
  let { source, rows, onchanged }: { source: EditableSource; rows: Row[]; onchanged: () => void } = $props();

  const dupes = $derived(findDuplicates(rows));
  // svelte-ignore state_referenced_locally
  let chosen = $state<boolean[]>(findDuplicates(rows).map(() => true));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let pending = $state<Removal["inserts"] | null>(null);

  const selected = $derived(dupes.filter((_, k) => chosen[k]));
  const spotify = $derived(source.kind === "playlist");
  const sameLink = $derived(spotify && selected.some((d) => d.reason === "uri"));
  const waiting = $derived((pending ?? []).flatMap((p) => p.uris).map((uri) => rows.find((r) => r.uri === uri)?.name ?? uri));
  const describe = (row: Row) => [row.name, row.artists.join(", ")].filter(Boolean).join(" · ");

  async function run(action: () => Promise<void>, success: string) {
    busy = true;
    error = null;
    try {
      await action();
      pending = null;
      toasts.show(success);
    } catch (e) {
      console.error("[tools] removing duplicates failed", e);
      if (e instanceof PutBackError) pending = e.pending;
      error = describeError(e);
    } finally {
      busy = false;
      if (spotify) tools.version++;
      // While copies wait to go back, keep these rows: re-reading would forget which ones.
      if (!pending) onchanged();
    }
  }

  const remove = () => {
    const drop = new Set(selected.map((d) => d.index));
    const count = `Removed ${drop.size} ${drop.size === 1 ? "duplicate" : "duplicates"}.`;
    return run(async () => {
      if (source.kind === "playlist") return removeSpotify(source.id, planRemoval(rows.map((r) => r.uri), drop));
      const playlist = carbonPlaylists.find(source.id);
      if (!playlist || playlist.items.length !== rows.length) throw new Error("The playlist changed. Open it again to check for duplicates.");
      await replaceCarbon(source.id, playlist.items.filter((_, i) => !drop.has(i)));
    }, count);
  };

  const retry = () => source.kind === "playlist" && pending && run(() => putBack(source.id, pending!), "Put the kept copies back.");
</script>

<div class="panel">
  {#if pending}
    <p class="error" role="alert">{error} Waiting to go back: {waiting.join(", ")}.</p>
    <div class="actions"><button class="pill accent" onclick={retry} disabled={busy}><Icon name="restore" size={16} />Put them back</button></div>
  {:else if !dupes.length}
    <p class="summary"><Icon name="check" size={16} /> No duplicates in {source.name}.</p>
  {:else}
    <p class="summary">{dupes.length} {dupes.length === 1 ? "song repeats" : "songs repeat"} an earlier one. The first copy always stays.</p>
    <ol class="list">
      {#each dupes as d, k (d.index)}
        <li>
          <input type="checkbox" bind:checked={chosen[k]} aria-label="Remove {rows[d.index].name} at {d.index + 1}" />
          <span class="text">
            <span class="name">{describe(rows[d.index])}</span>
            <span class="sub tabular">#{d.index + 1}, repeats #{d.of + 1}{d.reason === "isrc" ? ` (${rows[d.of].album || "another release"})` : ""}</span>
          </span>
          <span class="badge">{d.reason === "uri" ? "Same song" : "Same recording"}</span>
        </li>
      {/each}
    </ol>
    {#if sameLink}
      <p class="fine">Spotify takes out every copy of a song at once, so Carbon puts the copy you keep back in its place. It then shows as just added.</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="pill accent" onclick={remove} disabled={busy || !selected.length}>
        <Icon name="trash" size={16} />{busy ? "Removing…" : `Remove ${selected.length}`}
      </button>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .summary {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--text-muted);
  }

  .list {
    max-height: min(42vh, 380px);
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .list li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-height: 46px;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-md);
  }

  .list li:nth-child(odd) {
    background: var(--row-stripe);
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
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
  .fine {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .badge {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    color: var(--text-muted);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .error {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
