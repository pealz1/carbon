<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeError } from "$lib/errors";
  import CopyPanel from "./CopyPanel.svelte";
  import DupesPanel from "./DupesPanel.svelte";
  import ExportPanel from "./ExportPanel.svelte";
  import type { Row, Source } from "./rows";
  import SortPanel from "./SortPanel.svelte";
  import { copyable, editable, readRows, tools, type ToolsTab } from "./tools.svelte";

  // One dialog for a playlist's tools. Rows are read once (every page) and shared by the tabs.
  let { source, tab: initial }: { source: Source; tab: ToolsTab } = $props();

  const ALL_TABS: { id: ToolsTab; label: string }[] = [
    { id: "sort", label: "Sort" },
    { id: "duplicates", label: "Duplicates" },
    { id: "copy", label: "Save a copy" },
    { id: "export", label: "Export" },
  ];
  // Only playlists you can change get Sort and Duplicates; a copy needs somewhere to go.
  const TABS = $derived(ALL_TABS.filter((t) => t.id === "export" || (t.id === "copy" ? copyable(source) : editable(source))));

  /** Why a source lacks Sort and Duplicates. */
  const WHY: Partial<Record<Source["kind"], string>> = {
    liked: "Spotify doesn't let apps like Carbon reorder Liked Songs, so sorting and duplicates aren't here.",
    album: "Albums can't be changed, so there's only export.",
    youtube: "Sorting and duplicates work on your Spotify and Carbon playlists; YouTube Music playlists can be exported.",
  };
  const NOT_YOURS = "This playlist isn't yours, so Carbon can't change it. It can be copied when Spotify shares its songs with apps like Carbon.";
  const why = $derived(source.kind === "playlist" ? (source.readOnly ? NOT_YOURS : undefined) : WHY[source.kind]);

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

  {#if why}<p class="why">{why}</p>{/if}

  {#if error}
    <Status {error} onretry={load} />
  {:else if !rows}
    <div class="reading" aria-live="polite">
      <Status loading />
      <p>{progress ? `Reading songs… ${progress.done}${progress.total ? ` of ${progress.total}` : ""}` : "Reading songs…"}</p>
    </div>
  {:else if tab === "sort" && editable(source)}
    <SortPanel {source} {rows} onchanged={load} />
  {:else if tab === "duplicates" && editable(source)}
    <DupesPanel {source} {rows} onchanged={load} />
  {:else if tab === "copy" && copyable(source)}
    <CopyPanel {source} {rows} />
  {:else}
    <ExportPanel {source} {rows} />
  {/if}
</Modal>

<style>
  .tabs {
    margin-bottom: var(--sp-4);
  }

  .why {
    margin: 0 0 var(--sp-4);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .reading p {
    margin: calc(var(--sp-6) * -1) 0 var(--sp-4);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
