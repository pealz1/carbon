<script lang="ts">
  import Modal from "$lib/components/Modal.svelte";

  // Asks for one name (a new collection, a rename). Opened with `askName`, so a menu can use it
  // without a place in the layout.
  let {
    title,
    action,
    initial = "",
    placeholder = "",
    problemWith,
    ondone,
  }: { title: string; action: string; initial?: string; placeholder?: string; problemWith: (name: string) => string | null; ondone: (name: string | null) => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(initial);
  let touched = $state(false);
  const problem = $derived(touched || name ? problemWith(name) : null);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (!problemWith(name)) ondone(name.trim());
  }
</script>

<Modal {title} onclose={() => ondone(null)}>
  <form onsubmit={submit} novalidate>
    <label class="field">
      <span class="label">Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} autofocus {placeholder} aria-invalid={!!problem} aria-describedby={problem ? "name-error" : undefined} />
      {#if problem}<span class="error" id="name-error">{problem}</span>{/if}
    </label>
    <div class="actions">
      <button type="button" class="pill" onclick={() => ondone(null)}>Cancel</button>
      <button type="submit" class="pill accent">{action}</button>
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
    box-shadow: 0 0 0 1px var(--accent);
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
</style>
