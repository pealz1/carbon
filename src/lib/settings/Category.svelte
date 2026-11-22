<script lang="ts">
  // One Settings category. All of them stay mounted so search can list their rows; only the
  // current one shows.
  import type { Snippet } from "svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { CATEGORIES, type CategoryId } from "./categories";
  import { provideCategory } from "./index.svelte";

  let { id, current, children }: { id: CategoryId; current: CategoryId; children: Snippet } = $props();
  const label = $derived(t(CATEGORIES.find((category) => category.id === id)?.label ?? ""));

  provideCategory({
    get id() {
      return id;
    },
    get label() {
      return label;
    },
  });
</script>

<section class="category" hidden={current !== id} aria-labelledby="settings-{id}">
  <h2 id="settings-{id}">{label}</h2>
  {@render children()}
</section>

<style>
  .category {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .category[hidden] {
    display: none;
  }

  h2 {
    font-size: var(--fs-hero);
    font-weight: 800;
    line-height: 40px;
  }
</style>
