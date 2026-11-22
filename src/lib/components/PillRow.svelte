<script lang="ts" module>
  export interface Pill {
    id: string;
    label: string;
    /** A link pill; without it the pill is a choice reported through `onpick`. */
    href?: string;
  }
</script>

<script lang="ts">
  import { t } from "$lib/i18n/locale.svelte";

  // A row of pills that scrolls sideways when it runs out of room: Home's shelves, and the pages
  // that belong together (your library, your listening).
  let { pills, current, label, onpick }: { pills: Pill[]; current: string; label: string; onpick?: (id: string) => void } = $props();
</script>

<nav class="pills" aria-label={label}>
  {#each pills as pill, i (pill.id)}
    {#if pill.href}
      <a class="chip pressable" class:on={pill.id === current} href={pill.href} aria-current={pill.id === current ? "page" : undefined} style="--i: {i}">{t(pill.label)}</a>
    {:else}
      <button class="chip" class:on={pill.id === current} aria-pressed={pill.id === current} onclick={() => onpick?.(pill.id)} style="--i: {i}">{t(pill.label)}</button>
    {/if}
  {/each}
</nav>

<style>
  .pills {
    display: flex;
    gap: var(--sp-2);
    margin: 0 calc(var(--page-x, 0px) * -1) var(--sp-5);
    padding: 2px var(--page-x, 0px);
    overflow-x: auto;
  }

  .chip {
    flex: none;
    height: 34px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: rgb(var(--tint) / 0.07);
    box-shadow: var(--rim);
    color: var(--text);
    font-size: var(--fs-small);
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    animation: chip-in 360ms var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 28ms);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
  }

  .chip:hover {
    background: rgb(var(--tint) / 0.14);
    box-shadow: var(--rim-hover);
    translate: 0 -1px;
    text-decoration: none;
  }

  /* The chosen pill is a Paper chip, like the app's other segmented choices. */
  .chip.on {
    background: var(--paper);
    box-shadow: 0 2px 10px -3px rgb(0 0 0 / 0.55);
    color: var(--ink);
  }

  @keyframes chip-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.96);
    }
  }
</style>
