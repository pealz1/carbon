<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";

  // The search box on a service's front page. What is typed settles into `term` after a pause and
  // lives in the address (?q=), so Back returns to the same results.
  let { term = $bindable(), placeholder, label }: { term: string; placeholder: string; label: string } = $props();
  const DEBOUNCE_MS = 320;
  let query = $state(untrack(() => term));

  $effect(() => {
    const next = query.trim();
    const timer = setTimeout(() => {
      if (next === term) return;
      term = next;
      void goto(next ? `?q=${encodeURIComponent(next)}` : "?", { replaceState: true, keepFocus: true, noScroll: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });
</script>

<div class="field">
  <Icon name="search" size={20} />
  <input bind:value={query} {placeholder} aria-label={label} spellcheck="false" />
</div>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    height: 48px;
    max-width: 520px;
    margin-bottom: var(--sp-6);
    padding: 0 var(--sp-4);
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
    height: 100%;
    background: none;
    border: 0;
    outline: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    user-select: text;
  }

  input::placeholder {
    color: var(--text-faint);
    font-weight: 500;
  }
</style>
