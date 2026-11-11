<script lang="ts">
  import { goto } from "$app/navigation";
  import { onDestroy } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { describeError } from "$lib/errors";
  import { localLibrary } from "$lib/local/library.svelte";
  import { services } from "$lib/services.svelte";
  import { toasts } from "$lib/toast.svelte";
  import { importFile, type ImportedFile } from "./files";
  import { parseImport, type ImportRow } from "./formats";
  import { matchLocal, matchSpotify, type Match } from "./match";
  import { createCarbonPlaylist, createSpotifyPlaylist, openCarbon, tools } from "./tools.svelte";

  // Import a CSV, JSON or M3U file into a new Spotify playlist (songs found through search) or a
  // new Carbon playlist (files already in the local library, by path). Nothing is created until
  // the listener has reviewed what was found and what wasn't.
  type Step = "pick" | "ready" | "matching" | "review";
  type Target = "spotify" | "carbon";

  let step = $state<Step>("pick");
  let file = $state<ImportedFile | null>(null);
  let rows = $state<ImportRow[]>([]);
  let name = $state("");
  let target = $state<Target>(services.active.spotify ? "spotify" : "carbon");
  let matches = $state<Match[]>([]);
  let chosen = $state<boolean[]>([]);
  let done = $state(0);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let controller: AbortController | null = null;

  const found = $derived(matches.filter((m) => m.uri || m.item).length);
  const picked = $derived(matches.filter((m, i) => chosen[i] && (m.uri || m.item)));
  const via = { link: "Link", isrc: "ISRC", search: "Search", path: "File" } as const;

  onDestroy(() => controller?.abort());

  async function choose() {
    error = null;
    try {
      const picked = await importFile();
      if (!picked) return;
      rows = parseImport(picked.extension, picked.text);
      file = picked;
      name = picked.name;
      step = "ready";
    } catch (e) {
      console.error("[import] reading the file failed", e);
      error = describeError(e);
    }
  }

  async function find() {
    error = null;
    done = 0;
    step = "matching";
    try {
      if (target === "carbon") {
        await localLibrary.load();
        matches = matchLocal(rows, localLibrary.raw, file?.folder ?? "");
      } else {
        controller = new AbortController();
        matches = await matchSpotify(rows, (n) => (done = n), controller.signal);
        if (controller.signal.aborted) return void (step = "ready");
      }
      chosen = matches.map((m) => Boolean(m.uri || m.item));
      step = "review";
    } catch (e) {
      console.error("[import] matching failed", e);
      error = describeError(e);
      step = "ready";
    }
  }

  async function create() {
    busy = true;
    error = null;
    try {
      if (target === "spotify") {
        const id = await createSpotifyPlaylist(name, picked.map((m) => m.uri!));
        await goto(`/playlist/${id}`);
      } else {
        const id = await createCarbonPlaylist(name, picked.map((m) => m.item!));
        if (!id) throw new Error("Couldn't create the Carbon playlist.");
        await openCarbon(id);
      }
      toasts.show(`Imported ${picked.length} ${picked.length === 1 ? "song" : "songs"}.`);
      tools.close();
    } catch (e) {
      console.error("[import] creating the playlist failed", e);
      error = describeError(e);
    } finally {
      busy = false;
    }
  }

  const describe = (row: ImportRow) => [row.title || row.path || row.uri, row.artist].filter(Boolean).join(" · ");
</script>

<Modal title="Import a playlist" onclose={tools.close} wide>
  {#if step === "pick"}
    <p class="lead">Pick a CSV, JSON or M3U file. Carbon reads the songs, shows you what it found, and only then creates the playlist.</p>
    <div class="actions"><button class="pill accent" onclick={choose}><Icon name="import" size={16} />Choose a file…</button></div>
  {:else if step === "ready"}
    <p class="lead"><strong>{file?.name}</strong> lists {rows.length.toLocaleString()} {rows.length === 1 ? "song" : "songs"}.</p>
    <label class="field">
      <span class="eyebrow">Playlist name</span>
      <input class="input" bind:value={name} maxlength="100" />
    </label>
    <div class="field">
      <span class="eyebrow" id="import-target">Create a</span>
      <div class="segmented" role="radiogroup" aria-labelledby="import-target">
        <button role="radio" aria-checked={target === "spotify"} class:active={target === "spotify"} disabled={!services.active.spotify} onclick={() => (target = "spotify")}>Spotify playlist</button>
        <button role="radio" aria-checked={target === "carbon"} class:active={target === "carbon"} onclick={() => (target = "carbon")}>Carbon playlist</button>
      </div>
      <p class="hint">
        {target === "spotify"
          ? "Each song is looked up on Spotify, by ISRC when the file has one, else by title and artist. Large files take a while."
          : "Local files are matched by path to songs already in your library; Spotify links come along too."}
      </p>
    </div>
    <div class="actions">
      <button class="pill" onclick={() => (step = "pick")}>Back</button>
      <button class="pill accent" onclick={find} disabled={!name.trim()}>Find songs</button>
    </div>
  {:else if step === "matching"}
    <p class="lead" aria-live="polite">Looking up songs… {done.toLocaleString()} of {rows.length.toLocaleString()}</p>
    <div class="bar"><span style="transform: scaleX({rows.length ? done / rows.length : 0})"></span></div>
    <div class="actions"><button class="pill" onclick={() => controller?.abort()}>Stop</button></div>
  {:else}
    <p class="lead">
      Found {found.toLocaleString()} of {matches.length.toLocaleString()}.
      {#if matches.length - found}{(matches.length - found).toLocaleString()} weren't found and stay out.{/if}
    </p>
    <ol class="review">
      {#each matches as m, i (i)}
        <li class:missing={!m.uri && !m.item}>
          {#if m.uri || m.item}
            <input type="checkbox" bind:checked={chosen[i]} aria-label="Include {m.row.title || 'this song'}" />
          {:else}
            <span class="gap"></span>
          {/if}
          <span class="text">
            <span class="name">{describe(m.row)}</span>
            {#if m.label}<span class="sub">{m.label}</span>{/if}
          </span>
          <span class="badge" class:none={!m.via}>{m.via ? via[m.via] : "Not found"}</span>
        </li>
      {/each}
    </ol>
    <div class="actions">
      <button class="pill" onclick={() => (step = "ready")}>Back</button>
      <button class="pill accent" onclick={create} disabled={busy || !picked.length}>
        {busy ? "Creating…" : `Create playlist with ${picked.length.toLocaleString()} ${picked.length === 1 ? "song" : "songs"}`}
      </button>
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
  .lead {
    margin: 0 0 var(--sp-4);
    max-width: 62ch;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .lead strong {
    color: var(--text);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-bottom: var(--sp-4);
  }

  .field .input {
    max-width: 420px;
  }

  .hint {
    margin: 0;
    max-width: 62ch;
    color: var(--text-faint);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-4);
  }

  .bar {
    height: 4px;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform var(--dur-med) var(--ease-out);
  }

  .review {
    max-height: min(46vh, 420px);
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  .review li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-height: 46px;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-md);
    content-visibility: auto;
    contain-intrinsic-size: auto 46px;
  }

  .review li:nth-child(odd) {
    background: var(--row-stripe);
  }

  .review li.missing .name {
    color: var(--text-faint);
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .sub {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .badge {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    color: var(--text-muted);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .badge.none {
    color: var(--warning);
    box-shadow: inset 0 0 0 1px currentColor;
  }

  .error {
    margin: var(--sp-3) 0 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }
</style>
