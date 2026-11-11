<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeError } from "$lib/errors";
  import ExportPanel from "./ExportPanel.svelte";
  import type { Row, Source } from "./rows";
  import { readRows, tools, type ToolsTab } from "./tools.svelte";

  // One dialog for a playlist's tools. Rows are read once (every page) and shared by the tabs.
  let { source, tab: initial }: { source: Source; tab: ToolsTab } = $props();

  const TABS: { id: ToolsTab; label: string }[] = [{ id: "export", label: "Export" }];

  // svelte-ignore state_referenced_locally
  let tab = $state<ToolsTab>(initial);
  let rows = $state<Row[] | null>(null);
  let progress = $state<{ done: number; total: number | null } | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    rows = null;
    error = null;
    progress = null;
    try {
      rows = await readRows(source, (done, total) => (progress = { done, total }));
    } catch (e) {
      console.error("[tools] reading rows failed", e);
      error = describeError(e);
    }
  }

  onMount(() => void load());
</script>

<Modal title={source.name} onclose={tools.close} wide>
  {#if TABS.length > 1}
    <div class="segmented tabs" role="tablist" aria-label="Playlist tools">
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>
  {/if}

  {#if error}
    <Status {error} onretry={load} />
  {:else if !rows}
    <div class="reading" aria-live="polite">
      <Status loading />
      <p>{progress ? `Reading songs… ${progress.done}${progress.total ? ` of ${progress.total}` : ""}` : "Reading songs…"}</p>
    </div>
  {:else}
    <ExportPanel {source} {rows} />
  {/if}
</Modal>

<style>
  .tabs {
    margin-bottom: var(--sp-4);
  }

  .reading p {
    margin: calc(var(--sp-6) * -1) 0 var(--sp-4);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
