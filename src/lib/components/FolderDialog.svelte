<script lang="ts">
  import { dialogs, type FolderDialog } from "$lib/dialogs.svelte";
  import { addFolder, LIMITS, movePlaylist, nameProblem, renameFolder } from "$lib/organizer";
  import { organizer } from "$lib/organizer.svelte";
  import Modal from "./Modal.svelte";

  let { request }: { request: FolderDialog } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(request.mode === "rename" ? request.folder.name : "");
  let touched = $state(false);
  let saving = $state(false);
  const problem = $derived(touched || name ? nameProblem(name) : null);
  const close = () => (dialogs.folder = null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (nameProblem(name) || saving) return;
    saving = true;
    const r = request;
    const done =
      r.mode === "rename"
        ? await organizer.change((lib) => renameFolder(lib, r.folder.id, name))
        : await organizer.change((lib) => {
            const id = crypto.randomUUID();
            const created = addFolder(lib, name, r.parentId, id);
            return r.moveIn ? movePlaylist(created, r.moveIn, id) : created;
          });
    saving = false;
    if (done) close();
  }
</script>

<Modal title={request.mode === "rename" ? "Rename folder" : "New folder"} onclose={close}>
  <form onsubmit={submit} novalidate>
    <label class="field">
      <span class="label">Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={name}
        maxlength={LIMITS.nameChars + 10}
        autofocus
        placeholder="Road trips"
        aria-invalid={!!problem}
        aria-describedby={problem ? "folder-error" : undefined}
      />
      {#if problem}<span class="error" id="folder-error">{problem}</span>{/if}
    </label>
    <div class="actions">
      <button type="button" class="pill" onclick={close}>Cancel</button>
      <button type="submit" class="pill accent" disabled={saving}>{request.mode === "rename" ? "Rename" : "Create"}</button>
    </div>
  </form>
</Modal>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .label {
    font-weight: 600;
  }

  input {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    border: 1px solid var(--glass-edge);
    background: var(--glass);
    color: var(--text);
    font: inherit;
    user-select: text;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  [aria-invalid="true"] {
    border-color: var(--danger);
  }

  .error {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .pill {
    height: 38px;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    font-weight: 600;
  }

  .pill:hover:not(:disabled) {
    background: var(--glass-edge-top);
  }

  .pill.accent {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: transparent;
  }

  .pill:disabled {
    opacity: 0.5;
  }
</style>
