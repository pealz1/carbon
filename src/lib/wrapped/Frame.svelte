<script lang="ts">
  import type { Snippet } from "svelte";

  // The frame one slide is laid in, and the type and motion all slides share. A slide's root is a
  // <section>. Its lines carry .rise, with an --i that sets their turn; the rest are roles a line
  // can take (.lead-in, .title, .figure, .name, .sub, .clip, .facts). Sizes and the artwork's
  // colour come from the story (--figure, --display, --measure, --art, --thumb, --tone).
  let { children }: { children: Snippet } = $props();
</script>

<div class="story-slide">{@render children()}</div>

<style>
  /* Over the tap zones, letting taps through: only a slide's own buttons take the pointer. */
  .story-slide {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--sp-4) var(--sp-7) var(--sp-7);
    pointer-events: none;
  }

  .story-slide :global(:is(button, a)) {
    pointer-events: auto;
  }

  /* Kept to one class of weight (the frame's own doesn't count), so a slide's own rule always wins. */
  :global {
    :where(.story-slide) > section {
      width: min(100%, var(--measure));
    }

    :where(.story-slide) :is(h1, h2, p, ol, dl, dd, figure) {
      margin: 0;
    }

    :where(.story-slide) .rise {
      animation: story-rise var(--dur-slow) var(--ease-out) backwards;
      animation-delay: calc(var(--i, 0) * 90ms);
    }

    /* The words that read into what a slide is about: "You listened for", then the figure. */
    :where(.story-slide) .lead-in {
      color: var(--text-muted);
      font-size: var(--fs-section);
      font-weight: 600;
      line-height: 1.3;
    }

    /* A heading may sit in a narrow column, and a translation may be one long word. */
    :where(.story-slide) .title {
      font-size: var(--display);
      font-weight: 800;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }

    :where(.story-slide) .figure {
      color: var(--tone);
      font-family: var(--font-display);
      font-size: var(--figure);
      font-weight: 800;
      line-height: 0.9;
      letter-spacing: -0.045em;
    }

    /* A song, artist or album by name: up to three lines, then cut. */
    :where(.story-slide) .name {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      padding-bottom: 0.08em;
      overflow: hidden;
      font-family: var(--font-display);
      font-size: var(--display);
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: var(--tracking-tight);
      overflow-wrap: anywhere;
    }

    :where(.story-slide) .sub {
      color: var(--text-muted);
      font-size: var(--fs-section);
      line-height: 1.3;
    }

    :where(.story-slide) .clip {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Small facts side by side: a quiet label over its value. */
    :where(.story-slide) .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-4) var(--sp-6);
    }

    :where(.story-slide) .facts dt {
      color: var(--text-muted);
      font-size: var(--fs-small);
    }

    :where(.story-slide) .facts dd {
      margin-top: var(--sp-1);
      font-family: var(--font-display);
      font-size: var(--fs-section);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
    }
  }

  @keyframes -global-story-rise {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
  }
</style>
