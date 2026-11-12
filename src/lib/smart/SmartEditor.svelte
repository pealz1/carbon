<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { LIMITS, parseRule, type Field, type Rule, type SmartPlaylist, type Sources } from "./rules";
  import { smart } from "./store.svelte";

  // Create or change a smart playlist: where songs come from, the rules they must pass, how many
  // to keep and where they go.
  let { playlist, onclose }: { playlist: SmartPlaylist | null; onclose: () => void } = $props();

  type Draft = { field: Field; op: string; value: string };
  const FIELDS: { id: Field; label: string; ops: { id: string; label: string }[] }[] = [
    { id: "artist", label: "Artist", ops: [{ id: "is", label: "is" }, { id: "isNot", label: "isn't" }] },
    { id: "added", label: "Date added", ops: [{ id: "within", label: "in the last (days)" }] },
    { id: "duration", label: "Length", ops: [{ id: "under", label: "under (min)" }, { id: "over", label: "over (min)" }] },
    { id: "explicit", label: "Explicit", ops: [{ id: "yes", label: "is explicit" }, { id: "no", label: "isn't explicit" }] },
    { id: "year", label: "Release year", ops: [{ id: "from", label: "is from" }, { id: "until", label: "is up to" }] },
  ];
  const SOURCES: { id: keyof Sources; label: string }[] = [
    { id: "liked", label: "Liked Songs" },
    { id: "playlists", label: "Your playlists" },
    { id: "albums", label: "Saved albums" },
    { id: "local", label: "Local files" },
  ];
  const DEFAULTS: Record<Field, Draft> = {
    artist: { field: "artist", op: "is", value: "" },
    added: { field: "added", op: "within", value: "30" },
    duration: { field: "duration", op: "under", value: "5" },
    explicit: { field: "explicit", op: "no", value: "" },
    year: { field: "year", op: "from", value: String(new Date().getFullYear() - 5) },
  };

  function toDraft(rule: Rule): Draft {
    switch (rule.field) {
      case "artist":
        return { field: "artist", op: rule.op, value: rule.value };
      case "added":
        return { field: "added", op: "within", value: String(rule.days) };
      case "duration":
        return { field: "duration", op: rule.op, value: String(rule.minutes) };
      case "explicit":
        return { field: "explicit", op: rule.value ? "yes" : "no", value: "" };
      case "year":
        return { field: "year", op: rule.op, value: String(rule.year) };
    }
  }

  function toRule(d: Draft): Rule | null {
    const n = Number(d.value);
    if (d.field === "artist") return parseRule({ field: "artist", op: d.op, value: d.value });
    if (d.field === "added") return parseRule({ field: "added", days: n });
    if (d.field === "duration") return parseRule({ field: "duration", op: d.op, minutes: n });
    if (d.field === "explicit") return parseRule({ field: "explicit", value: d.op === "yes" });
    return parseRule({ field: "year", op: d.op, year: n });
  }

  // svelte-ignore state_referenced_locally
  const start = playlist;
  let name = $state(start?.name ?? "");
  let match = $state(start?.match ?? "all");
  let drafts = $state<Draft[]>(start?.rules.map(toDraft) ?? [{ ...DEFAULTS.added }]);
  let sources = $state<Sources>(start ? { ...start.sources } : { liked: true, playlists: false, albums: false, local: false });
  let limit = $state(start?.limit ?? 500);
  let output = $state(start?.output ?? "carbon");
  let error = $state<string | null>(null);

  const rules = $derived(drafts.map(toRule));
  const invalid = $derived(rules.findIndex((r) => r === null));
  const anySource = $derived(Object.values(sources).some(Boolean));

  const changeField = (i: number, field: Field) => (drafts[i] = { ...DEFAULTS[field] });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim()) return void (error = "Give it a name.");
    if (!anySource) return void (error = "Pick at least one place to take songs from.");
    if (invalid >= 0) return void (error = `Rule ${invalid + 1} needs a value.`);
    const next: SmartPlaylist = {
      id: start?.id ?? crypto.randomUUID(),
      name: name.trim().slice(0, 100),
      match,
      rules: rules as Rule[],
      sources: { ...sources },
      limit,
      output: start?.output ?? output,
      targetId: start?.targetId ?? null,
      refreshedMs: start?.refreshedMs ?? 0,
    };
    if (await smart.put(next)) onclose();
    else error = smart.error;
  }
</script>

<Modal title={start ? "Edit smart playlist" : "New smart playlist"} {onclose} wide>
  <form class="form" onsubmit={save} novalidate>
    <label class="field">
      <span class="eyebrow">Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:value={name} maxlength="100" autofocus />
    </label>

    <fieldset class="field">
      <legend class="eyebrow">Songs from</legend>
      <div class="chips">
        {#each SOURCES as s (s.id)}
          <label class="chip" class:on={sources[s.id]}><input type="checkbox" bind:checked={sources[s.id]} />{s.label}</label>
        {/each}
      </div>
      <p class="hint">Spotify only shares the songs of playlists you own, so playlists you follow can't be used.</p>
    </fieldset>

    <fieldset class="field">
      <legend class="eyebrow">Rules</legend>
      <div class="segmented" role="radiogroup" aria-label="Match">
        <button type="button" role="radio" aria-checked={match === "all"} class:active={match === "all"} onclick={() => (match = "all")}>Match all</button>
        <button type="button" role="radio" aria-checked={match === "any"} class:active={match === "any"} onclick={() => (match = "any")}>Match any</button>
      </div>
      <ol class="rules">
        {#each drafts as d, i (i)}
          {@const field = FIELDS.find((f) => f.id === d.field)!}
          <li class:bad={rules[i] === null}>
            <select aria-label="Rule {i + 1} field" value={d.field} onchange={(e) => changeField(i, e.currentTarget.value as Field)}>
              {#each FIELDS as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
            </select>
            <select aria-label="Rule {i + 1} condition" bind:value={d.op}>
              {#each field.ops as op (op.id)}<option value={op.id}>{op.label}</option>{/each}
            </select>
            {#if d.field !== "explicit"}
              <input class="input" aria-label="Rule {i + 1} value" bind:value={d.value} inputmode={d.field === "artist" ? "text" : "numeric"} />
            {:else}
              <span></span>
            {/if}
            <button type="button" class="remove" onclick={() => drafts.splice(i, 1)} aria-label="Remove rule {i + 1}" title="Remove"><Icon name="close" size={14} /></button>
          </li>
        {/each}
      </ol>
      <button type="button" class="pill ghost" onclick={() => drafts.push({ ...DEFAULTS.artist })}><Icon name="plus" size={15} />Add rule</button>
      {#if drafts.some((d) => d.field === "added") && sources.local}
        <p class="hint">Local files have no date added, so “Date added” never picks them.</p>
      {/if}
    </fieldset>

    <div class="row">
      <label class="field">
        <span class="eyebrow">Keep up to</span>
        <select bind:value={limit}>
          {#each LIMITS as l (l)}<option value={l}>{l.toLocaleString()} songs</option>{/each}
        </select>
      </label>
      <div class="field">
        <span class="eyebrow" id="smart-output">Save as</span>
        <div class="segmented" role="radiogroup" aria-labelledby="smart-output">
          <button type="button" role="radio" aria-checked={output === "carbon"} class:active={output === "carbon"} disabled={!!start} onclick={() => (output = "carbon")}>Carbon playlist</button>
          <button type="button" role="radio" aria-checked={output === "spotify"} class:active={output === "spotify"} disabled={!!start} onclick={() => (output = "spotify")}>Spotify playlist</button>
        </div>
      </div>
    </div>
    <p class="hint">
      Newest additions come first. {output === "spotify" ? "Carbon makes a new Spotify playlist for it; local files stay out." : "Carbon makes a new Carbon playlist for it."}
      It refreshes when you ask, and on start when it's more than a day old.
    </p>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="pill" onclick={onclose}>Cancel</button>
      <button type="submit" class="pill accent">{start ? "Save and refresh" : "Create"}</button>
    </div>
  </form>
</Modal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .field > .input {
    max-width: 420px;
  }

  legend {
    padding: 0;
    margin-bottom: var(--sp-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.06);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text-muted);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur-fast),
      color var(--dur-fast);
  }

  .chip.on {
    background: var(--paper);
    box-shadow: none;
    color: var(--ink);
  }

  .chip:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .rules {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rules li {
    display: grid;
    grid-template-columns: 150px 170px minmax(0, 1fr) 30px;
    align-items: center;
    gap: var(--sp-2);
  }

  .rules li.bad .input {
    box-shadow: inset 0 0 0 2px var(--danger);
  }

  .remove {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .remove:hover {
    color: var(--text);
    background: var(--glass-active);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-5);
  }

  .hint {
    margin: 0;
    max-width: 66ch;
    color: var(--text-faint);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  .error {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }
</style>
