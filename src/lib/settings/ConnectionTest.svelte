<script lang="ts">
  // Settings → Services: whether each music provider answers, and how fast.
  import { invoke } from "@tauri-apps/api/core";
  import { describeError } from "$lib/errors";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  let testing = $state(false);
  let results = $state<{ name: string; status: number | null; elapsed: number }[]>([]);
  let error = $state<string | null>(null);

  async function test() {
    testing = true;
    error = null;
    try {
      results = await invoke("provider_diagnostics");
    } catch (e) {
      error = describeError(e);
    } finally {
      testing = false;
    }
  }
</script>

{#snippet answers()}
  <ul class="items">
    {#each results as item (item.name)}
      <li>
        <span>{item.name}</span>
        <span class="answer tabular">{item.status === null ? "Unreachable" : `HTTP ${item.status} · ${item.elapsed} ms`}</span>
      </li>
    {/each}
  </ul>
{/snippet}

<Group heading="Troubleshooting">
  <Row label="Test provider connections" message={error} warn keywords="diagnostics network offline ping status" below={results.length ? answers : undefined}>
    <button class="pill" disabled={testing} onclick={test}>{testing ? "Checking…" : "Run test"}</button>
  </Row>
</Group>

<style>
  .answer {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
