<script lang="ts">
  import { dialogs } from "$lib/dialogs.svelte";
  import { allTags, LIMITS, normalizeTag, setTags } from "$lib/organizer";
  import { organizer } from "$lib/organizer.svelte";
  import type { PlaylistSummary } from "$lib/spotify/types";
  import Modal from "./Modal.svelte";

  // Tags save as you add or remove them; there's nothing to confirm.
  let { playlist }: { playlist: PlaylistSummary } = $props();
  let text = $state("");
  let problem = $state<string | null>(null);

  const tags = $derived(organizer.data.tags[playlist.id] ?? []);
  const suggestions = $derived(allTags(organizer.data).filter((t) => !tags.some((own) => own.toLowerCase() === t.toLowerCase())));
  const close = () => (dialogs.tags = null);

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) {
      problem = raw.trim() ? `Tags can be up to ${LIMITS.tagChars} characters.` : null;
      return;
    }
    problem = null;
    text = "";
    void organizer.change((lib) => setTags(lib, playlist.id, [...tags, tag]));
  }

  const remove = (tag: string) => organizer.change((lib) => setTags(lib, playlist.id, tags.filter((t) => t !== tag)));

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(text);
    } else if (event.key === "Backspace" && !text && tags.length) {
      void remove(tags[tags.length - 1]);
    }
  }
</script>

<Modal title="Tags for {playlist.name}" onclose={close}>
  <div class="body">
    <ul class="chips" aria-label="Tags">
      {#each tags as tag (tag)}
        <li class="chip">
          {tag}
          <button onclick={() => remove(tag)} aria-label="Remove tag {tag}">×</button>
        </li>
      {:else}
        <li class="none">No tags yet.</li>
      {/each}
    </ul>
    <label class="field">
      <span class="label">Add a tag</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={text} onkeydown={onKey} placeholder="focus, late night, gym…" autofocus aria-describedby={problem ? "tag-error" : undefined} />
      {#if problem}<span class="error" id="tag-error">{problem}</span>{/if}
    </label>
    {#if suggestions.length}
      <div class="suggest">
        <span class="eyebrow">Your tags</span>
        <div class="row">
          {#each suggestions as tag (tag)}
            <button class="chip ghost" onclick={() => add(tag)}>+ {tag}</button>
          {/each}
        </div>
      </div>
    {/if}
    <div class="actions">
      <button class="pill accent" onclick={() => (text.trim() && add(text), close())}>Done</button>
    </div>
  </div>
</Modal>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .chips,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 30px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--accent-deep);
    color: var(--text);
    font-size: var(--fs-small);
    font-weight: 600;
  }

  .chip button {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
  }

  .chip button:hover {
    color: var(--text);
  }

  .chip.ghost {
    background: var(--glass-active);
    color: var(--text-muted);
  }

  .chip.ghost:hover {
    color: var(--text);
  }

  .none {
    color: var(--text-faint);
    font-size: var(--fs-small);
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

  .error {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .suggest {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .pill {
    height: 38px;
    padding: 0 var(--sp-5);
    border-radius: var(--r-pill);
    font-weight: 600;
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
