<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { describeError } from "$lib/errors";
  import { toasts } from "$lib/toast.svelte";
  import * as api from "$lib/youtube/api";
  import { youtube, type YtDialog } from "$lib/youtube/session.svelte";
  import Modal from "./Modal.svelte";

  // Create, rename or delete a YouTube Music playlist (they live in your Google account).
  const MAX_NAME = 150;
  let { request }: { request: YtDialog } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(request.mode === "rename" ? request.playlist.title : "");
  let saving = $state(false);
  let error = $state<string | null>(null);
  const trimmed = $derived(name.trim());
  const problem = $derived(request.mode !== "delete" && trimmed.length > MAX_NAME ? `Keep it under ${MAX_NAME} characters.` : null);
  const close = () => (youtube.dialog = null);

  async function run(): Promise<void> {
    const r = request;
    if (r.mode === "create") {
      const id = await api.createPlaylist(trimmed, r.videoIds);
      toasts.show(r.videoIds.length ? `Added to ${trimmed}.` : `Created ${trimmed}.`);
      if (!r.videoIds.length) void goto(`/youtube/playlist/${encodeURIComponent(id)}`);
    } else if (r.mode === "rename") {
      await api.renamePlaylist(r.playlist.id, trimmed);
      toasts.show(`Renamed to ${trimmed}.`);
    } else {
      await api.deletePlaylist(r.playlist.id);
      toasts.show(`Deleted ${r.playlist.title}.`);
      if (page.url.pathname === `/youtube/playlist/${r.playlist.id}`) void goto("/youtube/library");
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving || problem || (request.mode !== "delete" && !trimmed)) return;
    saving = true;
    error = null;
    try {
      await run();
      await youtube.refresh();
      close();
    } catch (e) {
      console.error("[youtube] playlist change failed", e);
      error = describeError(e);
    } finally {
      saving = false;
    }
  }

  const titles = { create: "New YouTube Music playlist", rename: "Rename playlist", delete: "Delete playlist?" };
  const actions = { create: "Create", rename: "Rename", delete: "Delete" };
</script>

<Modal title={titles[request.mode]} onclose={close}>
  <form onsubmit={submit} novalidate>
    {#if request.mode === "delete"}
      <p class="muted">“{request.playlist.title}” will be deleted from your YouTube Music account. This can't be undone.</p>
    {:else}
      <label class="field">
        <span class="label">Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" bind:value={name} maxlength={MAX_NAME + 10} autofocus placeholder="Late night drives" aria-invalid={!!problem} />
        {#if problem}<span class="error">{problem}</span>{/if}
      </label>
      {#if request.mode === "create"}<p class="muted">New playlists are private.</p>{/if}
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="pill" onclick={close}>Cancel</button>
      <button type="submit" class="pill" class:accent={request.mode !== "delete"} class:danger={request.mode === "delete"} class:solid={request.mode === "delete"} disabled={saving}>
        {actions[request.mode]}
      </button>
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

  .muted {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  [aria-invalid="true"] {
    box-shadow: inset 0 0 0 2px var(--danger);
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
  }
</style>
