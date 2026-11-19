<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { describeError } from "$lib/errors";
  import { carbonPlaylists } from "$lib/local/playlists.svelte";
  import { toItem } from "$lib/local/tracks";
  import { resolveProviderLink, type Collection } from "$lib/providers/catalog";
  import { appleExport, matchSongs, readCollection, readTrackFile, type Match } from "$lib/providers/import";
  import * as yt from "$lib/youtube/api";
  import type { Track } from "$lib/spotify/types";
  let url = $state(""),
    name = $state(""),
    items = $state<Match[]>([]),
    busy = $state(false),
    error = $state(""),
    status = $state(""),
    done = $state(0);
  let controller: AbortController | undefined,
    offset = $state(0),
    fixing = $state<number | null>(null),
    term = $state("");
  let fileLists = $state<Collection[]>([]),
    fileIndex = $state(0);
  const count = $derived(items.filter((i) => i.selected).length);
  onMount(() => {
    url = page.url.searchParams.get("url") || "";
    return () => controller?.abort();
  });
  async function load(input: (signal: AbortSignal) => Promise<Collection>) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    busy = true;
    items = [];
    error = "";
    status = "Reading songs…";
    done = 0;
    offset = 0;
    fixing = null;
    try {
      const list = await input(current.signal);
      current.signal.throwIfAborted();
      name = list.title.slice(0, 100);
      status = `Matching ${list.songs.length} songs on YouTube Music`;
      const result = await matchSongs(list.songs, current.signal, (n) => (done = n));
      current.signal.throwIfAborted();
      items = result;
      status = "";
    } catch (e) {
      if (!current.signal.aborted) {
        error = describeError(e);
        status = "";
      }
    } finally {
      if (controller === current) {
        busy = false;
        status = "";
      }
    }
  }
  async function fromLink() {
    let link;
    try {
      link = await resolveProviderLink(url);
    } catch (e) {
      error = describeError(e);
      return;
    }
    if (!link) {
      error = "Paste a full playlist, album, or track link from a supported provider.";
      return;
    }
    void load((signal) => readCollection(link, signal));
  }
  async function fromFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("Choose a file under 8 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding =
        bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
      const content = new TextDecoder(encoding).decode(bytes);
      fileLists = content.trimStart().startsWith("<")
        ? appleExport(content)
        : [{ title: file.name.replace(/\.[^.]+$/, ""), songs: readTrackFile(content) }];
      fileIndex = 0;
      items = [];
      error = "";
      if (fileLists.length === 1) await load(async () => fileLists[0]);
    } catch (e) {
      error = describeError(e);
    }
  }
  async function alternatives(index: number) {
    if (busy || !term.trim()) return;
    busy = true;
    error = "";
    try {
      const result = await yt.search(term.trim(), "songs");
      items[index].candidates = result.songs.slice(0, 6);
      items[index].selected = null;
      items[index].reason = result.songs.length ? "Choose a recording" : "No match";
      fixing = null;
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (busy || !name.trim() || !count) return;
    busy = true;
    error = "";
    try {
      const tracks = items.flatMap((i): Track[] => (i.selected ? [i.selected] : []));
      const id = await carbonPlaylists.create(name.trim(), tracks.map(toItem));
      if (!id) throw new Error(carbonPlaylists.error || "Could not save the playlist.");
      await goto("/carbon/" + id);
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="importer">
  <h1>Import a playlist</h1>
  <p>
    Import from Spotify, Apple Music, Deezer, SoundCloud, YouTube, Mixcloud, or Internet Archive. Review the YouTube
    Music recordings before saving.
  </p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      fromLink();
    }}
  >
    <label for="source-link">Playlist, album, or song link</label>
    <div class="actions">
      <input id="source-link" class="input" type="url" bind:value={url} placeholder="https://" maxlength="2048" />
      <button class="pill accent" disabled={busy || !url.trim()}>Read songs</button>
    </div>
  </form>
  <label>
    Or choose an exported track list <input
      type="file"
      accept=".csv,.tsv,.txt,.m3u,.m3u8,.xml"
      disabled={busy}
      onchange={(e) => {
        void fromFile(e.currentTarget.files?.[0]);
        e.currentTarget.value = "";
      }}
    />
  </label>
  {#if fileLists.length > 1}<label>
      Playlist in this file <select class="input" bind:value={fileIndex}>
        {#each fileLists as list, i}<option value={i}>{list.title} ({list.songs.length})</option>{/each}
      </select>
    </label><button class="pill" disabled={busy} onclick={() => load(async () => fileLists[fileIndex])}>
      Review this playlist
    </button>{/if}
  {#if status}<div role="status">
      {status}{done ? ` · ${done} checked` : ""}
      <button class="pill" onclick={() => controller?.abort()}>Cancel</button>
    </div>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <div id="provider-import-preview"></div>
  {#if items.length}
    <label>Playlist name <input class="input" bind:value={name} maxlength="100" /></label>
    <div class="actions">
      <strong>{count} of {items.length} songs selected</strong>
      <button
        class="pill"
        onclick={() => {
          for (const item of items) item.selected = null;
        }}
      >
        Deselect all
      </button>
      <button class="pill accent" disabled={busy || !name.trim() || !count} onclick={save}>Save Carbon playlist</button>
    </div>
    <ol start={offset + 1}>
      {#each items.slice(offset, offset + 50) as item, i}
        <li>
          <div><strong>{item.source.title}</strong> <small>{item.source.artist}</small></div>
          <label>
            {item.reason}<select
              class="input"
              value={item.selected?.id || ""}
              aria-label={"Recording for " + item.source.title}
              onchange={(e) => (item.selected = item.candidates.find((t) => t.id === e.currentTarget.value) || null)}
            >
              <option value="">Skip song</option>
              {#each item.candidates as t}<option value={t.id}>
                  {t.name} — {t.artists.map((a) => a.name).join(", ")}
                </option>{/each}
            </select>
          </label>
          <button
            class="pill"
            onclick={() => {
              fixing = offset + i;
              term = [item.source.title, item.source.artist].join(" ");
            }}
          >
            Find another recording
          </button>
          {#if fixing === offset + i}<form
              onsubmit={(e) => {
                e.preventDefault();
                void alternatives(offset + i);
              }}
            >
              <label>Search YouTube Music <input class="input" bind:value={term} /></label><button
                class="pill"
                disabled={busy}
              >
                Find
              </button>
            </form>{/if}
        </li>
      {/each}
    </ol>
    {#if items.length > 50}<div class="actions">
        <button class="pill" disabled={offset === 0} onclick={() => (offset -= 50)}>Previous</button><span>
          {offset + 1}–{Math.min(offset + 50, items.length)}
        </span><button class="pill" disabled={offset + 50 >= items.length} onclick={() => (offset += 50)}>Next</button>
      </div>{/if}
  {/if}
</section>

<style>
  .importer {
    display: grid;
    align-content: start;
    gap: var(--sp-4);
    max-width: 62rem;
  }
  h1,
  p {
    margin: 0;
  }
  label {
    display: grid;
    gap: 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  #source-link {
    min-width: 18rem;
    flex: 1;
  }
  ol {
    padding-left: 2rem;
  }
  li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  li label {
    margin: 6px 0;
  }
  small {
    color: var(--text-muted);
  }
  select {
    max-width: 100%;
  }
</style>
