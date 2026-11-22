<script lang="ts">
  // What a Settings search found: rows from every category under their category's name. Choosing
  // one opens it where it lives.
  import Icon from "$lib/components/Icon.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { CATEGORIES } from "./categories";
  import type { SettingEntry } from "./index.svelte";

  let { rows, query, onopen }: { rows: SettingEntry[]; query: string; onopen: (row: SettingEntry) => void } = $props();

  const groups = $derived(CATEGORIES.map((category) => ({ category, rows: rows.filter((row) => row.category === category.id) })).filter((group) => group.rows.length));
</script>

<section class="results" aria-labelledby="settings-results">
  <h2 id="settings-results">Search results</h2>
  {#each groups as { category, rows: found } (category.id)}
    <section aria-labelledby="settings-results-{category.id}">
      <h3 id="settings-results-{category.id}">{t(category.label)}</h3>
      <ul class="plate">
        {#each found as row (row.el)}
          <li>
            <button class="hit" onclick={() => onopen(row)}>
              <span class="label">{row.label}</span>
              <span class="where">{row.group}</span>
              <Icon name="forward" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p role="status">No settings match “{query.trim()}”</p>
  {/each}
</section>

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* The same headings as a category and its groups, so nothing shifts when a search starts. */
  h2 {
    font-size: var(--fs-hero);
    font-weight: 800;
    line-height: 40px;
  }

  h3 {
    padding: 0 var(--sp-4) var(--sp-2);
    font-family: var(--font-text);
    font-size: var(--fs-small);
    font-weight: 700;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  ul {
    margin: 0;
    padding: var(--sp-1) var(--sp-2);
    list-style: none;
  }

  .hit {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 44px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    text-align: left;
    transition:
      background var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .hit:hover {
    background: var(--glass-hover);
  }

  .label {
    font-weight: 600;
  }

  .where {
    margin-left: auto;
    color: var(--text-muted);
    font-size: var(--fs-small);
    white-space: nowrap;
  }

  .hit :global(svg) {
    flex: none;
    color: var(--text-faint);
  }

  p {
    margin: 0;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
</style>
