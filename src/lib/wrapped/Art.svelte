<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";

  // A cover, shown whole and square, or a quiet blank when the play had none or it can't be
  // loaded. It fills the width its parent gives it. Small covers take the small corner.
  let { image, small = false }: { image: string | null; small?: boolean } = $props();

  let failed = $state<string | null>(null);
</script>

{#if image && image !== failed}
  <img src={image} alt="" width="640" height="640" class:small decoding="async" onerror={() => (failed = image)} />
{:else}
  <span class="blank" class:small><Icon name="note" size={small ? 18 : 44} /></span>
{/if}

<style>
  img,
  .blank {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-art);
    box-shadow: var(--shadow-art);
  }

  img {
    object-fit: cover;
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass);
    color: var(--text-muted);
  }

  .small {
    border-radius: var(--r-art-sm);
  }
</style>
