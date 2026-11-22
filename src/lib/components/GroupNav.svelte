<script lang="ts">
  import { page } from "$app/state";
  import { t } from "$lib/i18n/locale.svelte";
  import { groupOf, groupPages, isActive } from "$lib/nav";
  import { serverSession } from "$lib/servers/session.svelte";
  import { services } from "$lib/services.svelte";
  import PillRow from "./PillRow.svelte";

  // The pages that belong together, across the top of each: your library (saved music, podcasts,
  // collections, mixes, bookmarks, offline) and your listening (profile, top music, Wrapped,
  // history). Search's sources are offered on the Search page itself.
  const LABELS = { library: "Your library", you: "Your listening" } as const;
  const path = $derived(page.url.pathname);
  const place = $derived(groupOf(path));
  const group = $derived(place === "library" || place === "you" ? place : null);
  const pills = $derived(group ? groupPages(group, { ...services.active, servers: serverSession.list.map((s) => s.kind) }).map((i) => ({ id: i.href, label: i.label, href: i.href })) : []);
  const current = $derived(pills.find((p) => isActive(p.id, path))?.id ?? "");
</script>

{#if group && pills.length > 1}
  <div class="group"><PillRow {pills} {current} label={t(LABELS[group])} /></div>
{/if}

<style>
  .group {
    padding-top: var(--sp-4);
  }

  .group :global(.pills) {
    margin-bottom: 0;
  }
</style>
