<script lang="ts">
  import { goto } from "$app/navigation";
  import { onDestroy } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { toasts } from "$lib/toast.svelte";
  import { addable, datedName } from "./combine";
  import { saveCopy } from "./copy";
  import ProgressBar from "./ProgressBar.svelte";
  import type { Row, Source } from "./rows";
  import { tools } from "./tools.svelte";

  // "Save a copy": a new playlist named after this one and today's date, with the same songs in
  // the same order. A snapshot to keep before a big edit, or of a playlist someone else changes.
  let { source, rows }: { source: Source; rows: Row[] } = $props();

  const carbon = $derived(source.kind === "carbon");
  // Spotify's API can't add local files or unavailable songs; Carbon playlists copy whole.
  const total = $derived(carbon ? rows.length : rows.filter((r) => addable(r.uri)).length);
  const left = $derived(rows.length - total);
  const name = $derived(datedName(source.name));
  const songs = (n: number) => `${n.toLocaleString()} ${n === 1 ? "song" : "songs"}`;

  let busy = $state(false);
  let done = $state(0);
  let error = $state<string | null>(null);
  let controller: AbortController | null = null;
  let closed = false;

  // Closing the dialog stops the copy; what was added so far stays.
  onDestroy(() => {
    closed = true;
    controller?.abort();
  });

  async function run() {
    busy = true;
    done = 0;
    error = null;
    controller = new AbortController();
    try {
      const copy = await saveCopy(source, rows, (n) => (done = n), controller.signal);
      toasts.show(copy.stopped ? `Stopped. ${copy.name} has ${copy.added.toLocaleString()} of ${songs(total)}.` : `Saved ${copy.name}.`);
      if (closed) return;
      tools.close();
      await goto(copy.path);
    } catch (e) {
      console.error("[tools] saving a copy failed", e);
      error = `Couldn't finish the copy. ${describeError(e)}`;
    } finally {
      busy = false;
    }
  }
</script>

<div class="panel">
  <p class="lead">
    Makes a new {carbon ? "Carbon playlist" : "private Spotify playlist"} called <strong>{name}</strong> with the same songs in the same
    order{source.kind === "playlist" ? " and the same description" : ""}. {source.name} isn't changed.
  </p>
  <p class="count">
    <Icon name="note" size={14} />
    {songs(total)}{left ? ` · ${left.toLocaleString()} left out` : ""}
  </p>
  {#if left}<p class="fine">Spotify doesn't let apps like Carbon add local files or unavailable songs to a playlist.</p>{/if}
  {#if source.kind === "playlist"}<p class="fine">The cover isn't copied; Spotify makes one from the songs.</p>{/if}
  {#if busy && !carbon}<ProgressBar label="Adding songs…" {done} {total} />{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="actions">
    {#if busy && !carbon}
      <button class="pill" onclick={() => controller?.abort()}>Stop</button>
    {:else}
      <button class="pill" onclick={tools.close} disabled={busy}>Cancel</button>
    {/if}
    <button class="pill accent" onclick={run} disabled={busy || !total}><Icon name="listAdd" size={16} />{busy ? "Saving…" : "Save a copy"}</button>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .lead {
    margin: 0;
    max-width: 62ch;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .lead strong {
    color: var(--text);
  }

  .count {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    font-weight: 600;
  }

  .fine {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .error {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }
</style>
