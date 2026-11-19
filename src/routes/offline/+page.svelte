<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { describeError } from "$lib/errors";
  interface Storage {
    files: { name: string; bytes: number }[];
    used: number;
    limit: number;
  }
  let data = $state<Storage | null>(null),
    error = $state(""),
    pending = $state(""),
    busy = $state(false);
  const mb = (n: number) => (n / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " MB";
  onMount(() => {
    void invoke<Storage>("offline_storage")
      .then((x) => (data = x))
      .catch((e) => (error = describeError(e)));
  });
  async function remove(name: string) {
    busy = true;
    try {
      data = await invoke<Storage>("offline_remove", { name });
      pending = "";
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }
</script>

<header class="page-head">
  <h1>Offline music</h1>
  <p>Play files saved on this device, including openly licensed recordings from Internet Archive.</p>
</header>
<a class="pill accent" href="/local?tab=songs">Play local files</a> <a class="pill" href="/archive">Find recordings</a>
{#if error}<p role="alert">{error}</p>{/if}
{#if data}<h2>Downloads</h2>
  <p>{mb(data.used)} of {mb(data.limit)} used</p>
  {#if !data.files.length}<p>Open a recording in Internet Archive and choose an available audio file to save.</p>{/if}
  <ul>
    {#each data.files as file}<li>
        {file.name} · {mb(file.bytes)}
        {#if pending === file.name}<button class="pill" disabled={busy} onclick={() => remove(file.name)}>
            Delete downloaded copy
          </button><button class="pill" disabled={busy} onclick={() => (pending = "")}>Cancel</button>
        {:else}<button class="pill" onclick={() => (pending = file.name)}>Remove</button>{/if}
      </li>{/each}
  </ul>{/if}

<style>
  li {
    margin-block: var(--sp-3);
  }
  h2 {
    margin-top: var(--sp-6);
  }
</style>
