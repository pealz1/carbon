<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { toasts } from "$lib/toast.svelte";
  import { exportFile } from "./files";
  import { exportText, type ExportFormat } from "./formats";
  import type { Row, Source } from "./rows";
  import { tools } from "./tools.svelte";

  let { source, rows }: { source: Source; rows: Row[] } = $props();

  const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
    { id: "csv", label: "CSV", hint: "Opens in spreadsheets. Every column Carbon knows: title, artist, album, length, ISRC, link and dates." },
    { id: "json", label: "JSON", hint: "The same details, for other apps and for importing back into Carbon." },
    { id: "m3u", label: "M3U", hint: "A playlist music players open: file paths for local files, web links for streamed songs." },
  ];

  let format = $state<ExportFormat>("csv");
  let busy = $state(false);
  const exportable = $derived(rows.filter((r) => r.uri));
  const skipped = $derived(rows.length - exportable.length);

  async function run() {
    busy = true;
    try {
      const saved = await exportFile(source.name, format, exportText(format, source.name, rows));
      if (!saved) return;
      toasts.show(`Exported ${exportable.length} ${exportable.length === 1 ? "song" : "songs"} to ${saved}.`);
      tools.close();
    } catch (e) {
      console.error("[tools] export failed", e);
      toasts.error(`Couldn't export it. ${describeError(e)}`);
    } finally {
      busy = false;
    }
  }
</script>

<div class="panel">
  <div class="segmented" role="radiogroup" aria-label="File format">
    {#each FORMATS as f (f.id)}
      <button role="radio" aria-checked={format === f.id} class:active={format === f.id} onclick={() => (format = f.id)}>{f.label}</button>
    {/each}
  </div>
  <p class="hint">{FORMATS.find((f) => f.id === format)?.hint}</p>
  <p class="count">
    <Icon name="note" size={14} />
    {exportable.length.toLocaleString()} {exportable.length === 1 ? "song" : "songs"}{skipped ? ` · ${skipped} unavailable, left out` : ""}
  </p>
  <p class="fine">Exports hold song details and links, never audio.</p>
  <div class="actions">
    <button class="pill" onclick={tools.close}>Cancel</button>
    <button class="pill accent" onclick={run} disabled={busy || !exportable.length}><Icon name="export" size={16} />{busy ? "Saving…" : "Export…"}</button>
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .hint {
    margin: 0;
    max-width: 60ch;
    color: var(--text-muted);
    line-height: 1.5;
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

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }
</style>
