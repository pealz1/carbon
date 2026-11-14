<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { describeError } from "$lib/errors";
  import { toasts } from "$lib/toast.svelte";
  import { library, type TagEdit } from "./api";
  import { localLibrary } from "./library.svelte";
  import { problemsOf, toEdit, toForm, type TagForm } from "./tag-edit";

  const NOTHING: TagEdit = { title: "", artists: [], album: "", albumArtist: "", trackNo: null, discNo: null, year: null, genre: "" };
  const TEXT = [
    { key: "title", label: "Title", hint: "" },
    { key: "artists", label: "Artists", hint: "Separate several artists with a semicolon." },
    { key: "album", label: "Album", hint: "" },
    { key: "albumArtist", label: "Album artist", hint: "" },
    { key: "genre", label: "Genre", hint: "" },
  ] as const;
  const NUMBERS = [
    { key: "trackNo", label: "Track" },
    { key: "discNo", label: "Disc" },
    { key: "year", label: "Year" },
  ] as const;

  /** `id` is the library's id for the file; Rust resolves it, so no path ever leaves the webview. */
  let { id }: { id: string } = $props();
  let form = $state<TagForm>(toForm(NOTHING));
  let loaded = $state(false);
  let saving = $state(false);
  let failure = $state<string | null>(null);

  const path = $derived(localLibrary.raw.find((t) => t.id === id)?.path ?? "");
  const fileName = $derived(path.split(/[\\/]/).pop() ?? "");
  const problems = $derived(problemsOf(form));
  const blocked = $derived(!loaded || saving || Object.keys(problems).length > 0);
  const close = () => (dialogs.tagEditor = null);

  const fail = (e: unknown) => {
    console.error("[tags]", e);
    failure = describeError(e);
  };

  onMount(() => {
    library.tags(id).then((tags) => {
      form = toForm(tags);
      loaded = true;
    }, fail);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (blocked) return;
    saving = true;
    failure = null;
    try {
      await library.editTags(id, toEdit(form));
      toasts.show("Tags saved.");
      close();
    } catch (e) {
      fail(e);
    } finally {
      saving = false;
    }
  }
</script>

{#snippet field(key: keyof TagForm, label: string, hint: string, numeric: boolean)}
  <label class="field">
    <span class="label">{label}</span>
    <input
      bind:value={form[key]}
      disabled={!loaded}
      inputmode={numeric ? "numeric" : undefined}
      placeholder={key === "title" ? fileName : undefined}
      aria-invalid={!!problems[key]}
      aria-describedby={problems[key] || hint ? `tag-${key}-note` : undefined}
    />
    {#if problems[key]}
      <span class="error" id="tag-{key}-note">{problems[key]}</span>
    {:else if hint}
      <span class="hint" id="tag-{key}-note">{hint}</span>
    {/if}
  </label>
{/snippet}

<Modal title="Edit tags" onclose={close}>
  <form onsubmit={submit} novalidate aria-busy={!loaded || saving}>
    <p class="file" title={path}>{fileName}</p>
    {#each TEXT as f (f.key)}{@render field(f.key, f.label, f.hint, false)}{/each}
    <div class="numbers">
      {#each NUMBERS as f (f.key)}{@render field(f.key, f.label, "", true)}{/each}
    </div>
    {#if failure}<p class="error" role="alert">{failure}</p>{/if}
    <div class="actions">
      <button type="button" class="pill" onclick={close}>Cancel</button>
      <button type="submit" class="pill accent" disabled={blocked}>{saving ? "Saving…" : "Save to file"}</button>
    </div>
  </form>
</Modal>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .file {
    margin: calc(var(--sp-3) * -1) 0 0;
    overflow: hidden;
    color: var(--text-faint);
    font-size: var(--fs-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .label {
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-3);
    align-items: start;
  }

  input {
    min-width: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    color: var(--text);
    font: inherit;
    user-select: text;
  }

  .numbers input {
    font-variant-numeric: tabular-nums;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  input:disabled {
    opacity: 0.5;
  }

  [aria-invalid="true"] {
    border-color: var(--danger);
  }

  .hint {
    color: var(--text-faint);
    font-size: var(--fs-caption);
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
    margin-top: var(--sp-2);
  }
</style>
