<script lang="ts">
  import type { Listed } from "./listed";

  // Songs a service lists but Carbon can't play (a preview, a protected stream, no stream at all).
  // They stay visible so a list is honest about what it holds: folded away, dimmed, each with its
  // reason. They have no play button and never enter the queue.
  let { songs, service }: { songs: Listed[]; service: string } = $props();
  const summary = $derived(songs.length === 1 ? `1 song ${service} doesn't let Carbon play` : `${songs.length} songs ${service} doesn't let Carbon play`);
</script>

{#if songs.length}
  <details class="dimmed">
    <summary>{summary}</summary>
    <ul>
      {#each songs as { track, reason }, i (track.uri + i)}
        <li>
          <span class="text">
            <span class="name">{track.name}</span>
            <span class="artists">{track.artists.map((a) => a.name).join(", ")}</span>
          </span>
          <span class="reason">{reason}</span>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .dimmed {
    margin: var(--sp-3) 0 var(--sp-6);
  }

  summary {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    transition: background var(--dur-fast);
  }

  summary::before {
    content: "+";
    width: 1ch;
    color: var(--text-faint);
  }

  .dimmed[open] summary::before {
    content: "−";
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--glass-hover);
  }

  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  ul {
    list-style: none;
    margin: var(--sp-2) 0 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-4);
    min-height: 50px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    content-visibility: auto;
    contain-intrinsic-size: auto 50px;
  }

  li:nth-child(odd) {
    background: var(--row-stripe);
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Dimmed by colour, not opacity: faint text still clears 4.5:1 on a striped row. */
  .name,
  .artists {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-faint);
  }

  .name {
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .artists,
  .reason {
    font-size: var(--fs-caption);
  }

  .reason {
    color: var(--text-muted);
    text-align: right;
  }
</style>
