<script lang="ts">
  import { actionEntries } from "$lib/command-actions";
  import {
    pageEntries,
    playlistEntries,
    linkEntries,
    recentEntry,
    searchPageEntries,
    spotifyResultEntries,
    youtubeResultEntries,
    type Entry,
  } from "$lib/command-entries";
  import { parseRecent, rank, remember, type RecentEntry } from "$lib/command-palette";
  import { devices } from "$lib/devices.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { describeError } from "$lib/errors";
  import { redirectFor, services } from "$lib/services.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import * as yt from "$lib/youtube/api";
  import { isYoutubeUri } from "$lib/youtube/uri";
  import Icon from "./Icon.svelte";

  // Ctrl K: one field to go anywhere, run a command, or find something to play. Keyboard first
  // (combobox over a grouped listbox); the field's text is also searched live on each service.
  const RECENT_KEY = "carbon.palette.recent";
  const DEBOUNCE_MS = 250;
  const MIN_SEARCH = 2;
  const LIMIT = { local: 8, playlists: 6, idle: 6 };

  interface Group {
    id: string;
    label: string;
    entries: Entry[];
    note?: string;
  }

  let dialog = $state<HTMLDialogElement>();
  let query = $state("");
  let active = $state(0);
  let recent = $state<RecentEntry[]>(readRecent());
  let found = $state<{ term: string; spotify: Entry[]; youtube: Entry[]; errors: string[] }>({ term: "", spotify: [], youtube: [], errors: [] });
  let searching = $state(false);
  /** Artwork that didn't load shows the entry's icon instead. */
  let broken = $state(new Set<string>());

  function readRecent(): RecentEntry[] {
    try {
      return parseRecent(localStorage.getItem(RECENT_KEY));
    } catch {
      return [];
    }
  }

  /** Recents from a service that's no longer connected are left out. */
  function available(entry: RecentEntry): boolean {
    if (entry.href) return redirectFor(entry.href, services.active) === null;
    if (!entry.playUri) return false;
    return isYoutubeUri(entry.playUri) ? services.active.youtube : !entry.playUri.startsWith("spotify:") || services.active.spotify;
  }

  // Spotify Connect devices for "Play on …", fetched when the palette opens if none are known yet.
  $effect(() => {
    if (services.active.spotify && !devices.list.length && !devices.loading) void devices.refresh();
  });

  $effect(() => {
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => opener?.focus?.();
  });

  // Live results: debounced, and an older search that answers late is dropped.
  let generation = 0;
  $effect(() => {
    const term = query.trim();
    const mine = ++generation;
    // A pasted link is opened, not searched for.
    if (term.length < MIN_SEARCH || linkEntries(term).length) {
      found = { term: "", spotify: [], youtube: [], errors: [] };
      searching = false;
      return;
    }
    searching = true;
    const timer = setTimeout(() => void search(term, mine), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  async function search(term: string, mine: number) {
    const { spotify, youtube } = services.active;
    const [s, y] = await Promise.allSettled([
      spotify ? sp.search(term).then(spotifyResultEntries) : Promise.resolve([]),
      youtube ? yt.search(term).then(youtubeResultEntries) : Promise.resolve([]),
    ]);
    if (mine !== generation) return;
    const errors = [s, y].filter((r) => r.status === "rejected").map((r) => describeError((r as PromiseRejectedResult).reason));
    found = { term, spotify: s.status === "fulfilled" ? s.value : [], youtube: y.status === "fulfilled" ? y.value : [], errors };
    searching = false;
  }

  const groups = $derived.by((): Group[] => {
    const term = query.trim();
    const label = (e: Entry) => `${e.label} ${e.detail}`;
    if (!term) {
      const recents = recent.filter(available).map(recentEntry);
      return [
        { id: "recent", label: "Recent", entries: recents },
        { id: "actions", label: "Actions", entries: actionEntries().slice(0, LIMIT.idle) },
        { id: "pages", label: "Go to", entries: [...searchPageEntries(""), ...pageEntries()] },
      ].filter((g) => g.entries.length);
    }
    const link = linkEntries(term);
    if (link.length) return [{ id: "link", label: "Link", entries: link }];
    const local = rank([...actionEntries(), ...pageEntries()], term, label, LIMIT.local);
    const playlists = rank(playlistEntries(), term, label, LIMIT.playlists);
    const live = found.term === term ? found : { spotify: [], youtube: [], errors: [] };
    const waiting = searching || found.term !== term;
    return [
      { id: "best", label: "Actions and pages", entries: local },
      { id: "playlists", label: "Your playlists", entries: playlists },
      { id: "spotify", label: "Spotify", entries: live.spotify, note: services.active.spotify && waiting ? "Searching…" : undefined },
      { id: "youtube", label: "YouTube Music", entries: live.youtube, note: services.active.youtube && waiting ? "Searching…" : undefined },
      { id: "search", label: "Search", entries: searchPageEntries(term), note: live.errors[0] },
    ].filter((g) => g.entries.length || g.note);
  });

  const flat = $derived(groups.flatMap((g) => g.entries));
  const current = $derived(flat[Math.min(active, flat.length - 1)]);
  const optionId = (entry: Entry) => `palette-${entry.id.replace(/[^\w-]/g, "_")}`;

  $effect(() => {
    void query;
    active = 0;
  });

  $effect(() => {
    if (current) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  });

  const close = () => (dialogs.palette = false);

  function choose(entry: Entry) {
    if (entry.recent) {
      recent = remember(recent, entry.recent);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch (e) {
        console.warn("[palette] couldn't remember that pick", e);
      }
    }
    close();
    void Promise.resolve()
      .then(entry.run)
      .catch((e) => console.error("[palette]", e));
  }

  function onkeydown(event: KeyboardEvent) {
    const last = flat.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => (active >= last ? 0 : active + 1),
      ArrowUp: () => (active <= 0 ? last : active - 1),
      Home: () => 0,
      End: () => last,
    };
    if (moves[event.key] && (event.key.startsWith("Arrow") || event.ctrlKey)) {
      event.preventDefault();
      active = Math.max(0, moves[event.key]());
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      choose(current);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="palette glass"
  aria-label="Search, go anywhere or run a command"
  oncancel={(e) => (e.preventDefault(), close())}
  onclick={(e) => e.target === dialog && close()}
>
  <div class="field">
    <Icon name="search" size={20} />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={query}
      {onkeydown}
      autofocus
      spellcheck="false"
      autocomplete="off"
      placeholder="Search, go to a page or run a command"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-autocomplete="list"
      aria-activedescendant={current ? optionId(current) : undefined}
    />
    <kbd>Esc</kbd>
  </div>

  <div class="list" id="palette-list" role="listbox" aria-label="Results">
    {#each groups as group (group.id)}
      <div class="group" role="group" aria-labelledby="palette-group-{group.id}">
        <div class="heading" id="palette-group-{group.id}" role="presentation">{group.label}</div>
        {#each group.entries as entry (entry.id)}
          {@const selected = entry === current}
          <div
            class="option"
            class:selected
            id={optionId(entry)}
            role="option"
            aria-selected={selected}
            tabindex="-1"
            onclick={() => choose(entry)}
            onpointermove={() => (active = flat.indexOf(entry))}
          >
            {#if entry.image && !broken.has(entry.image)}
              <!-- YouTube's image host refuses requests that carry Carbon's address as the referrer. -->
              <img
                src={entry.image}
                alt=""
                width="32"
                height="32"
                class:round={entry.round}
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror={() => (broken = new Set(broken).add(entry.image ?? ""))}
              />
            {:else}
              <span class="glyph"><Icon name={entry.icon ?? "search"} size={16} /></span>
            {/if}
            <span class="text">
              <span class="label">{entry.label}</span>
              <span class="detail">{entry.detail}</span>
            </span>
            {#if selected}<span class="enter" aria-hidden="true">↵</span>{/if}
          </div>
        {/each}
        {#if group.note}<p class="note" role="status">{group.note}</p>{/if}
      </div>
    {:else}
      <p class="empty">Nothing matches. Try another word.</p>
    {/each}
  </div>

  <footer>
    <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
    <span><kbd>↵</kbd> open</span>
    <span><kbd>Esc</kbd> close</span>
  </footer>
</dialog>

<style>
  .palette {
    width: min(640px, calc(100vw - 2 * var(--sp-4)));
    max-height: min(560px, calc(100vh - 2 * var(--sp-6)));
    margin: max(var(--sp-6), 12vh) auto auto;
    padding: 0;
    border: 0;
    border-radius: var(--r-xl);
    color: var(--text);
    flex-direction: column;
    overflow: hidden;
    animation: rise var(--dur-med) var(--ease-out);
  }

  .palette[open] {
    display: flex;
  }

  .palette::backdrop {
    background: var(--scrim);
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-4) var(--sp-3) var(--sp-5);
    color: var(--text-muted);
    border-bottom: 1px solid var(--glass-edge);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text);
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    outline: none;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-2);
    scroll-padding: var(--sp-5) 0 var(--sp-2);
  }

  .group + .group {
    margin-top: var(--sp-2);
  }

  .heading {
    padding: var(--sp-2) var(--sp-3) var(--sp-1);
    color: var(--text-faint);
    font-size: var(--fs-caption);
    font-weight: 650;
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 44px;
    padding: 6px var(--sp-3);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background var(--dur-fast);
  }

  .option.selected {
    background: var(--glass-active);
  }

  .option img,
  .glyph {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--r-art-sm);
  }

  .option img {
    object-fit: cover;
  }

  .option img.round {
    border-radius: 50%;
  }

  .glyph {
    display: grid;
    place-items: center;
    background: var(--glass);
    color: var(--text-muted);
  }

  .option.selected .glyph {
    color: var(--accent);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .label,
  .detail {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .label {
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .detail {
    color: var(--text-muted);
    font-size: var(--fs-caption);
  }

  .enter {
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .note,
  .empty {
    margin: 0;
    padding: var(--sp-1) var(--sp-3) var(--sp-2);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .empty {
    padding: var(--sp-5) var(--sp-3);
    text-align: center;
  }

  footer {
    display: flex;
    gap: var(--sp-4);
    padding: var(--sp-2) var(--sp-5);
    border-top: 1px solid var(--glass-edge);
    color: var(--text-faint);
    font-size: var(--fs-caption);
  }

  footer span {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  kbd {
    min-width: 20px;
    padding: 1px var(--sp-1);
    border-radius: var(--r-sm);
    background: var(--glass-active);
    box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.35);
    color: var(--text-muted);
    font-family: inherit;
    font-size: var(--fs-micro);
    font-weight: 650;
    text-align: center;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
</style>
