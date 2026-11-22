<script lang="ts">
  // A headed group of rows on one plate. Also the home of the few shared pieces rows put under
  // themselves (a note, a text link, a plain list), so every category draws them alike.
  import type { Snippet } from "svelte";
  import { provideGroup } from "./index.svelte";

  interface Props {
    heading: string;
    /** A few words beside the heading that apply to every row in the group. */
    message?: string | null;
    warn?: boolean;
    /** An anchor other pages link to (`/settings#servers`). */
    id?: string;
    children: Snippet;
  }

  let { heading, message, warn = false, id, children }: Props = $props();
  const uid = $props.id();

  provideGroup({
    get heading() {
      return heading;
    },
  });
</script>

<section class="group" {id} aria-labelledby={uid}>
  <header>
    <h3 id={uid}>{heading}</h3>
    {#if message}<p class:warn>{message}</p>{/if}
  </header>
  <div class="rows plate">{@render children()}</div>
</section>

<style>
  .group {
    /* Clears the category bar that sticks to the top on a narrow stage. */
    scroll-margin-top: 132px;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--sp-3);
    padding: 0 var(--sp-4) var(--sp-2);
  }

  h3 {
    font-family: var(--font-text);
    font-size: var(--fs-small);
    font-weight: 700;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  header p {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-caption);
  }

  header p.warn {
    color: var(--warning);
  }

  .rows {
    padding: var(--sp-1) var(--sp-4);
  }

  .rows > :global(* + *) {
    border-top: 1px solid var(--glass-edge);
  }

  .rows :global(.note) {
    margin: 0;
    padding: var(--sp-3) 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.45;
  }

  .rows :global(.note.warn) {
    color: var(--warning);
  }

  .rows :global(.link) {
    color: var(--accent);
    font-weight: 600;
  }

  .rows :global(.link:hover) {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* Things a row lists under itself: paired remotes, blocked songs. Lines, never boxes. */
  .rows :global(.items) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows :global(.items > li) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-height: 44px;
    padding: var(--sp-1) 0;
  }

  .rows :global(.items > li + li) {
    border-top: 1px solid var(--glass-edge);
  }
</style>
