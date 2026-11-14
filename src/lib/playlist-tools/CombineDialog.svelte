<script lang="ts">
  import { goto } from "$app/navigation";
  import { onDestroy } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { describeError } from "$lib/errors";
  import { session } from "$lib/session.svelte";
  import { toasts } from "$lib/toast.svelte";
  import { combine, combinedName, type CombineMode } from "./combine";
  import { createFilled, stoppable, Stopped } from "./copy";
  import ProgressBar from "./ProgressBar.svelte";
  import type { Row, Source } from "./rows";
  import { readRows, sourceKey, tools } from "./tools.svelte";

  // Combine playlists you own (and Liked Songs) into a new one: every song, the songs they share,
  // or the first one's songs that the others lack. Nothing is created until the count is shown.
  let { first }: { first: string | null } = $props();

  const MODES: { id: CombineMode; label: string; hint: string }[] = [
    { id: "union", label: "All songs", hint: "Every song from the playlists you tick, each one once." },
    { id: "intersection", label: "In common", hint: "Only the songs that are in every playlist you tick." },
    { id: "difference", label: "Only in the first", hint: "Songs from the first playlist you tick that aren't in any of the others." },
  ];
  const LIKED: Source = { kind: "liked", name: "Liked Songs" };

  const sources = $derived<Source[]>([
    LIKED,
    ...session.playlists.filter((p) => p.ownerId === session.profile?.id).map((p): Source => ({ kind: "playlist", id: p.id, name: p.name })),
  ]);

  let mode = $state<CombineMode>("union");
  /** Source keys in the order they were ticked: the first is the one "Only in the first" keeps. */
  // svelte-ignore state_referenced_locally
  let picked = $state<string[]>(first ? [first] : []);
  /** Rows already read, by source key, so changing the mode doesn't read again. */
  let read = $state.raw<Record<string, Row[]>>({});
  let progress = $state<{ label: string; done?: number; total?: number | null } | null>(null);
  let creating = $state(false);
  let typed = $state<string | null>(null);
  let error = $state<string | null>(null);
  let controller: AbortController | null = null;
  let closed = false;

  const chosen = $derived(picked.map((key) => sources.find((s) => sourceKey(s) === key)).filter((s): s is Source => !!s));
  const result = $derived(chosen.length >= 2 && chosen.every((s) => read[sourceKey(s)]) ? combine(mode, chosen.map((s) => read[sourceKey(s)])) : null);
  const name = $derived(typed ?? combinedName(mode, chosen.map((s) => s.name)));
  const songs = (n: number) => `${n.toLocaleString()} ${n === 1 ? "song" : "songs"}`;

  onDestroy(() => {
    closed = true;
    controller?.abort();
  });

  const toggle = (key: string) => (picked = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key]);

  function badge(at: number): string {
    if (mode !== "difference") return String(at + 1);
    return at === 0 ? "Keep from this" : "Take out";
  }

  async function count() {
    error = null;
    controller = new AbortController();
    const { signal } = controller;
    try {
      for (const source of chosen) {
        const key = sourceKey(source);
        if (read[key]) continue;
        const label = `Reading ${source.name}…`;
        progress = { label };
        const rows = await readRows(source, stoppable(signal, (done, total) => (progress = { label, done, total })));
        read = { ...read, [key]: rows };
      }
    } catch (e) {
      if (e instanceof Stopped) return;
      console.error("[tools] reading playlists to combine failed", e);
      error = describeError(e);
    } finally {
      progress = null;
    }
  }

  async function create() {
    if (!result) return;
    const total = result.length;
    error = null;
    creating = true;
    progress = { label: "Adding songs…", done: 0, total };
    controller = new AbortController();
    try {
      const fields = { name, description: "", public: false, collaborative: false };
      const made = await createFilled(fields, result.map((r) => r.uri), (done) => (progress = { label: "Adding songs…", done, total }), controller.signal);
      toasts.show(made.stopped ? `Stopped. The new playlist has ${made.added.toLocaleString()} of ${songs(total)}.` : `Created a playlist with ${songs(total)}.`);
      if (closed) return;
      tools.close();
      await goto(`/playlist/${made.id}`);
    } catch (e) {
      console.error("[tools] creating the combined playlist failed", e);
      error = `Couldn't finish the playlist. ${describeError(e)}`;
    } finally {
      creating = false;
      progress = null;
    }
  }
</script>

<Modal title="Combine playlists" onclose={tools.close} wide>
  <div class="segmented" role="radiogroup" aria-label="What to keep">
    {#each MODES as m (m.id)}
      <button role="radio" aria-checked={mode === m.id} class:active={mode === m.id} disabled={creating} onclick={() => (mode = m.id)}>{m.label}</button>
    {/each}
  </div>
  <p class="hint">{MODES.find((m) => m.id === mode)?.hint} Songs match by link, or by recording when two releases share one.</p>

  <ul class="list" aria-label="Playlists to combine">
    {#each sources as s (sourceKey(s))}
      {@const key = sourceKey(s)}
      {@const at = picked.indexOf(key)}
      <li>
        <label>
          <input type="checkbox" checked={at >= 0} disabled={!!progress} onchange={() => toggle(key)} />
          <span class="name">{s.name}</span>
          {#if read[key]}<span class="sub tabular">{songs(read[key].length)}</span>{/if}
          {#if at >= 0}<span class="badge">{badge(at)}</span>{/if}
        </label>
      </li>
    {/each}
  </ul>
  {#if sources.length < 2}<p class="fine">Combining needs Liked Songs and at least one playlist of your own.</p>{/if}

  {#if result && !progress}
    <p class="count"><Icon name="note" size={14} />The new playlist will have {songs(result.length)}.</p>
    <label class="field">
      <span class="eyebrow">Playlist name</span>
      <input class="input" value={name} maxlength="100" oninput={(e) => (typed = e.currentTarget.value)} />
    </label>
  {/if}
  {#if progress}<ProgressBar {...progress} />{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="actions">
    {#if progress}
      <button class="pill" onclick={() => controller?.abort()}>Stop</button>
    {:else}
      <button class="pill" onclick={tools.close}>Cancel</button>
    {/if}
    {#if result}
      <button class="pill accent" onclick={create} disabled={!!progress || !result.length || !name.trim()}>
        <Icon name="plus" size={16} />{creating ? "Creating…" : "Create playlist"}
      </button>
    {:else}
      <button class="pill accent" onclick={count} disabled={!!progress || chosen.length < 2}>{progress ? "Reading…" : "Count songs"}</button>
    {/if}
  </div>
</Modal>

<style>
  .hint {
    margin: var(--sp-3) 0;
    max-width: 62ch;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .list {
    max-height: min(40vh, 340px);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .list li:nth-child(odd) {
    background: var(--row-stripe);
    border-radius: var(--r-md);
  }

  label:not(.field) {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-3);
    min-height: 42px;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-md);
    cursor: pointer;
  }

  label:not(.field):hover {
    background: var(--glass-hover);
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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

  .count {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    font-weight: 600;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .field .input {
    max-width: 420px;
  }

  .error {
    margin: var(--sp-3) 0 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-4);
  }
</style>
