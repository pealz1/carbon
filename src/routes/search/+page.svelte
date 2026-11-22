<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import Status from "$lib/components/Status.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { connections, parseProviderLink } from "$lib/providers/catalog";
  import BrowseSources from "$lib/search/BrowseSources.svelte";
  import LinkResult from "$lib/search/LinkResult.svelte";
  import type { Progress } from "$lib/search/map";
  import { loadRecent, remembered, saveRecent } from "$lib/search/recent";
  import SourceSection from "$lib/search/SourceSection.svelte";
  import { answersLink, matcherFor, searchable, selectedOf, type Setup, type SourceId } from "$lib/search/sources";
  import { serverSession } from "$lib/servers/session.svelte";
  import { services } from "$lib/services.svelte";

  // Search everywhere: one field, and every source the listener has answers in a section of its
  // own. The term and the chosen source live in the address, so Back returns to the same results.
  const DEBOUNCE_MS = 250;
  /** A term that stays this long was looked at, not typed through: it joins the recent searches. */
  const SETTLED_MS = 1500;

  const initial = page.url.searchParams.get("q") ?? "";
  let query = $state(initial);
  let term = $state(initial.trim());
  let wanted = $state(page.url.searchParams.get("source"));
  let soundcloud = $state(false);
  let recent = $state(loadRecent());
  let progress = $state<Partial<Record<SourceId, Progress>>>({});
  /** The address this page last wrote, so only a navigation from elsewhere (the command palette) is read back. */
  let written = page.url.search;

  const setup = $derived<Setup>({
    spotify: services.active.spotify,
    youtube: services.active.youtube,
    servers: serverSession.list.map((s) => s.kind),
    soundcloud,
  });
  const available = $derived(searchable(setup));
  const selected = $derived(selectedOf(wanted, available));
  const shown = $derived(selected === "all" ? available : available.filter((s) => s.id === selected));
  const matcher = $derived(matcherFor(setup));
  const pasted = $derived.by(() => {
    const link = parseProviderLink(term);
    return answersLink(link) ? link : null;
  });
  const waiting = $derived(shown.some((s) => (progress[s.id] ?? "loading") === "loading"));
  const nothing = $derived(!waiting && shown.every((s) => progress[s.id] === "empty"));

  onMount(() => {
    void serverSession.load();
    connections().then(
      (c) => (soundcloud = c.soundcloud),
      (e) => console.warn("[search] couldn't tell whether SoundCloud is set up", e),
    );
  });

  // Debounce typing, then put the term and source in the address.
  $effect(() => {
    const next = query.trim();
    const source = selected;
    const timer = setTimeout(() => {
      term = next;
      const params = new URLSearchParams({ ...(next && { q: next }), ...(source !== "all" && { source }) }).toString();
      written = params ? `?${params}` : "";
      if (written !== page.url.search) void goto(written || "?", { replace: true, reset: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  // Arriving again while already here ("Search for …" in the command palette) brings a new address.
  $effect(() => {
    const search = page.url.search;
    if (search === written) return;
    written = search;
    query = page.url.searchParams.get("q") ?? "";
    wanted = page.url.searchParams.get("source");
  });

  function keep(text: string) {
    recent = remembered(recent, text);
    saveRecent(recent);
  }

  $effect(() => {
    const settled = term;
    if (!settled || pasted) return;
    const timer = setTimeout(() => keep(settled), SETTLED_MS);
    return () => clearTimeout(timer);
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    term = query.trim();
    if (term && !pasted) keep(term);
  }

  function forget() {
    recent = [];
    saveRecent(recent);
  }
</script>

<form class="field" role="search" onsubmit={submit}>
  <Icon name="search" size={22} />
  <!-- svelte-ignore a11y_autofocus -->
  <input bind:value={query} type="search" placeholder="Songs, artists, albums or a link" aria-label="Search" autofocus spellcheck="false" autocomplete="off" maxlength="2048" />
  {#if query}
    <button type="button" class="clear" onclick={() => (query = "")} aria-label="Clear search" title="Clear"><Icon name="close" size={16} /></button>
  {/if}
</form>

<div class="sources" role="tablist" aria-label="Sources">
  <button role="tab" aria-selected={selected === "all"} onclick={() => (wanted = null)}>All</button>
  {#each available as source (source.id)}
    <button role="tab" aria-selected={selected === source.id} style="--hue: {source.hue}" onclick={() => (wanted = source.id)}>
      <span class="dot" aria-hidden="true"></span>{t(source.name)}
    </button>
  {/each}
</div>

{#if !term}
  {#if recent.length}
    <section class="recent">
      <header>
        <h2>Recent searches</h2>
        <button class="pill ghost" onclick={forget}>Clear</button>
      </header>
      <ul>
        {#each recent as past (past)}
          <li><button onclick={() => (query = past)}><Icon name="clock" size={14} /><span>{past}</span></button></li>
        {/each}
      </ul>
    </section>
  {/if}
  <BrowseSources running={setup} />
{:else if pasted}
  <LinkResult link={pasted} {matcher} onsearch={(text) => (query = text)} />
{:else}
  {#if selected === "all"}
    <p class="state" role="status" aria-live="polite">{#if waiting}Searching…{/if}</p>
  {/if}
  {#each shown as source (source.id)}
    <SourceSection {source} {term} brief={selected === "all"} {matcher} onmore={() => (wanted = source.id)} onprogress={(p) => (progress[source.id] = p)} />
  {/each}
  {#if selected === "all" && nothing}
    <Status empty={`${t("Nothing matches")} “${term}”.`} />
  {/if}
{/if}

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 56px;
    margin: var(--sp-5) 0 var(--sp-4);
    padding: 0 var(--sp-3) 0 var(--sp-5);
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
  }

  .field:focus-within {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }

  input::-webkit-search-cancel-button {
    display: none;
  }

  .clear {
    width: 34px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-muted);
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  .clear:hover {
    background: var(--glass-active);
    color: var(--text);
  }

  .clear:active {
    transform: scale(var(--press));
  }

  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-bottom: var(--sp-5);
  }

  .sources button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: var(--rim);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    white-space: nowrap;
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  .sources button:hover {
    background: var(--glass-active);
    color: var(--text);
  }

  .sources button:active {
    transform: scale(var(--press));
  }

  .sources button[aria-selected="true"] {
    background: var(--paper);
    color: var(--ink);
  }

  .clear:focus-visible,
  .sources button:focus-visible,
  .recent li button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Each source keeps one colour: here, on its section and on its tile. */
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: oklch(72% 0.16 var(--hue));
  }

  [aria-selected="true"] .dot {
    background: oklch(52% 0.18 var(--hue));
  }

  /* Holds its line whether or not anything is being asked, so results don't jump when it clears. */
  .state {
    min-height: 1.4em;
    margin: calc(var(--sp-3) * -1) 0 var(--sp-3);
    color: var(--text-faint);
    font-size: var(--fs-small);
  }

  .recent {
    margin-bottom: var(--sp-6);
  }

  .recent header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-2);
  }

  h2 {
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .recent ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .recent li button {
    max-width: 32ch;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--plate);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  .recent li span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent li button:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .recent li button:active {
    transform: scale(var(--press));
  }
</style>
