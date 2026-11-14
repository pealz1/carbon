<script lang="ts">
  import { untrack } from "svelte";
  import { isLocalUri } from "$lib/local/tracks";
  import { isRadioUri } from "$lib/radio/uri";
  import { isStreamUri } from "$lib/stream/uri";
  import { saved } from "$lib/saved.svelte";
  import Icon from "./Icon.svelte";

  let { uri, label, size = 16 }: { uri: string; label: string; size?: number } = $props();

  // Liked Songs is Spotify's: local files have nothing to like, and radio stations are kept on the Radio page.
  // shortcut: server songs have no heart yet; wire it to the server's own star/favourite call when wanted.
  const likeable = $derived(!isLocalUri(uri) && !isRadioUri(uri) && !isStreamUri(uri));

  $effect(() => {
    const target = uri;
    if (likeable) untrack(() => saved.want([target]));
  });

  const on = $derived(saved.has(uri) === true);
  /** A small pop when a like lands; not on load, so liked songs don't all bounce at once. */
  let burst = $state(false);

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    burst = !on;
    void saved.toggle(uri);
  }
</script>

{#if likeable}
  <button
    class="like"
    class:on
    class:burst={burst && on}
    onclick={toggle}
    onanimationend={() => (burst = false)}
    aria-pressed={on}
    aria-label={on ? `Remove ${label} from Liked Songs` : `Like ${label}`}
    title={on ? "Remove from Liked Songs" : "Save to Liked Songs"}
  >
    <Icon name="heart" {size} filled={on} />
  </button>
{/if}

<style>
  .like {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-spring);
  }

  .like:hover {
    color: var(--text);
    transform: scale(1.1);
  }

  .like:active {
    transform: scale(0.9);
  }

  .like.on {
    color: var(--accent);
  }

  .burst :global(svg) {
    animation: like-pop 420ms var(--ease-spring);
  }

  @keyframes like-pop {
    40% {
      transform: scale(1.35);
    }
  }
</style>
