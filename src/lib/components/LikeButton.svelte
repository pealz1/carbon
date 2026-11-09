<script lang="ts">
  import { untrack } from "svelte";
  import { saved } from "$lib/saved.svelte";
  import Icon from "./Icon.svelte";

  let { uri, label, size = 16 }: { uri: string; label: string; size?: number } = $props();

  $effect(() => {
    const target = uri;
    untrack(() => saved.want([target]));
  });

  const on = $derived(saved.has(uri) === true);

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    void saved.toggle(uri);
  }
</script>

<button
  class="like"
  class:on
  onclick={toggle}
  aria-pressed={on}
  aria-label={on ? `Remove ${label} from Liked Songs` : `Like ${label}`}
  title={on ? "Remove from Liked Songs" : "Save to Liked Songs"}
>
  <Icon name="heart" {size} filled={on} />
</button>

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
</style>
