<script lang="ts">
  import { goto } from "$app/navigation";
  import { coverFromFile } from "$lib/cover";
  import { dialogs, type PlaylistDialog } from "$lib/dialogs.svelte";
  import { describeError } from "$lib/errors";
  import { deletePlaylist, savePlaylist } from "$lib/playlist-actions";
  import { isValid, PLAYLIST_LIMITS, playlistProblems, type PlaylistDraft } from "$lib/playlist-form";
  import { toasts } from "$lib/toast.svelte";
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import Toggle from "./Toggle.svelte";

  let { request }: { request: PlaylistDialog } = $props();

  // The dialog is re-created for each request, so reading the initial request once is intended.
  // svelte-ignore state_referenced_locally
  const editing = request.mode === "edit" ? request.playlist : null;
  // svelte-ignore state_referenced_locally
  const addUris = request.mode === "create" ? (request.addUris ?? []) : [];
  // svelte-ignore state_referenced_locally
  const currentImage = request.mode === "edit" ? (request.largeImage ?? request.playlist.image) : null;

  let draft = $state<PlaylistDraft>({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    public: editing?.public ?? false,
    collaborative: editing?.collaborative ?? false,
  });
  let cover = $state<string | null>(null);
  let coverBusy = $state(false);
  let coverError = $state<string | null>(null);
  let touched = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  // svelte-ignore state_referenced_locally
  let confirmDelete = $state(request.mode === "edit" && !!request.confirmDelete);

  // Live validation, except "name required", which waits for a save attempt.
  const allProblems = $derived(playlistProblems(draft));
  const problems = $derived(touched || draft.name ? allProblems : { ...allProblems, name: undefined });
  const preview = $derived(cover ? `data:image/jpeg;base64,${cover}` : currentImage);
  const visibility = $derived(draft.collaborative ? "Collaborative · Private" : draft.public ? "Public" : "Private");

  const close = () => (dialogs.playlist = null);

  async function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    coverBusy = true;
    coverError = null;
    try {
      cover = await coverFromFile(file);
    } catch (e) {
      console.error("[playlist] cover", e);
      coverError = describeError(e);
    } finally {
      coverBusy = false;
    }
  }

  function setCollaborative(on: boolean) {
    draft.collaborative = on;
    if (on) draft.public = false; // Spotify only allows private collaborative playlists
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (!isValid(draft) || saving) return;
    saving = true;
    error = null;
    try {
      const result = await savePlaylist(editing?.id ?? null, draft, cover, addUris);
      if (result.coverError) toasts.error(result.coverError);
      else toasts.show(editing ? "Playlist updated." : `Created ${draft.name.trim()}.`);
      close();
      if (!editing) void goto(`/playlist/${result.id}`);
    } catch (e) {
      console.error("[playlist] save failed", e);
      error = describeError(e);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!editing) return;
    saving = true;
    const removed = await deletePlaylist(editing);
    saving = false;
    if (!removed) return;
    close();
    void goto("/library");
  }
</script>

<Modal title={editing ? "Edit playlist" : "New playlist"} onclose={close} wide>
  <form class="layout" onsubmit={submit} novalidate>
    <div class="preview" aria-label="Preview">
      <label class="cover" class:busy={coverBusy}>
        {#if preview}
          <img src={preview} alt="" width="220" height="220" />
        {:else}
          <span class="blank"><Icon name="lyrics" size={44} /></span>
        {/if}
        <span class="cover-hint"><Icon name="plus" size={18} />{preview ? "Change cover" : "Add a cover"}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onchange={pick} disabled={coverBusy} />
      </label>
      {#if coverError}<p class="field-error" role="alert">{coverError}</p>{/if}
      <p class="eyebrow">Playlist · {visibility}</p>
      <p class="preview-name" class:empty={!draft.name.trim()}>{draft.name.trim() || "Untitled"}</p>
      {#if draft.description.trim()}<p class="preview-description">{draft.description.trim()}</p>{/if}
      {#if addUris.length}<p class="preview-description">Starts with {addUris.length === 1 ? "1 song" : `${addUris.length} songs`}.</p>{/if}
    </div>

    <div class="fields">
      <label class="field">
        <span class="label">Name <span class="count tabular">{[...draft.name].length}/{PLAYLIST_LIMITS.name}</span></span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:value={draft.name}
          maxlength={PLAYLIST_LIMITS.name + 20}
          autofocus
          aria-invalid={!!problems.name}
          aria-describedby={problems.name ? "pl-name-error" : undefined}
        />
        {#if problems.name}<span class="field-error" id="pl-name-error">{problems.name}</span>{/if}
      </label>
      <label class="field">
        <span class="label">Description <span class="count tabular">{[...draft.description].length}/{PLAYLIST_LIMITS.description}</span></span>
        <textarea
          bind:value={draft.description}
          rows="3"
          placeholder="Optional"
          aria-invalid={!!problems.description}
          aria-describedby={problems.description ? "pl-description-error" : undefined}
        ></textarea>
        {#if problems.description}<span class="field-error" id="pl-description-error">{problems.description}</span>{/if}
      </label>
      <Toggle
        checked={draft.public}
        disabled={draft.collaborative}
        label="Public"
        description={draft.collaborative ? "Collaborative playlists are always private." : "Shows on your Spotify profile."}
        onchange={(v) => (draft.public = v)}
      />
      <Toggle checked={draft.collaborative} label="Collaborative" description="People you share it with can add songs." onchange={setCollaborative} />

      {#if error}<p class="form-error" role="alert">{error}</p>{/if}

      <div class="actions">
        {#if editing}
          {#if confirmDelete}
            <span class="confirm">Remove it from your library?</span>
            <button type="button" class="pill danger" onclick={remove} disabled={saving}>Remove</button>
            <button type="button" class="pill" onclick={() => (confirmDelete = false)}>Keep</button>
          {:else}
            <button type="button" class="pill ghost" onclick={() => (confirmDelete = true)}>Delete…</button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button type="button" class="pill" onclick={close}>Cancel</button>
        <button type="submit" class="pill accent" disabled={saving || coverBusy}>{saving ? "Saving…" : editing ? "Save" : "Create"}</button>
      </div>
    </div>
  </form>
</Modal>

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: var(--sp-5);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
  }

  .cover {
    position: relative;
    display: block;
    width: 220px;
    height: 220px;
    border-radius: var(--r-md);
    overflow: hidden;
    box-shadow: var(--shadow-art);
    cursor: pointer;
  }

  .cover img,
  .blank {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .blank {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--glass-active), var(--accent-deep));
    color: var(--text-faint);
  }

  .cover-hint {
    position: absolute;
    inset: auto 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    padding: var(--sp-3);
    background: var(--scrim);
    font-size: var(--fs-small);
    font-weight: 650;
    opacity: 0;
    transform: translateY(6px);
    transition:
      opacity var(--dur-fast),
      transform var(--dur-fast) var(--ease-out);
  }

  .cover:hover .cover-hint,
  .cover:focus-within .cover-hint,
  .cover.busy .cover-hint {
    opacity: 1;
    transform: none;
  }

  .cover input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .cover:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .eyebrow {
    margin: var(--sp-2) 0 0;
  }

  .preview-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 750;
    letter-spacing: var(--tracking-tight);
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  .preview-name.empty {
    color: var(--text-faint);
  }

  .preview-description {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    overflow-wrap: anywhere;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .label {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
  }

  .count {
    color: var(--text-faint);
    font-size: var(--fs-micro);
    font-weight: 500;
  }

  input:not([type]),
  textarea {
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    color: var(--text);
    font: inherit;
    resize: vertical;
    user-select: text;
  }

  input:not([type]):focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  [aria-invalid="true"] {
    border-color: var(--danger);
  }

  .field-error,
  .form-error {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }

  .spacer {
    flex: 1;
  }

  .confirm {
    font-size: var(--fs-small);
    color: var(--warning);
  }

  .pill {
    height: 38px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
    transition:
      background var(--dur-fast),
      transform var(--dur-fast) var(--ease-spring);
  }

  .pill:hover:not(:disabled) {
    background: var(--glass-edge-top);
  }

  .pill:active:not(:disabled) {
    transform: scale(0.97);
  }

  .pill:disabled {
    opacity: 0.5;
  }

  .pill.accent {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .pill.ghost {
    background: none;
    border-color: transparent;
    color: var(--text-muted);
  }

  .pill.danger:hover:not(:disabled),
  .pill.ghost:hover:not(:disabled) {
    background: var(--danger);
    color: var(--accent-ink);
  }
</style>
