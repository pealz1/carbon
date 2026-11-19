<script lang="ts">
  import { playlistArtwork } from "$lib/spotify/endpoints";
  import Icon from "./Icon.svelte";

  let { id, image, allowPublic = true, size }: { id: string; image: string | null; allowPublic?: boolean; size: number } = $props();
  let tile: HTMLSpanElement;
  let failed = $state<string | null>(null);
  let alternate = $state<string | null>(null);
  const src = $derived(image && image !== failed ? image : alternate);

  $effect(() => {
    const playlistId = id, publicCover = allowPublic, bad = failed;
    alternate = null;
    if (image && image !== bad) return;
    let current = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      playlistArtwork(playlistId, publicCover, bad).then((url) => {
        if (current && url !== bad) alternate = url;
      }).catch(() => { /* The music icon stays visible if Spotify has no usable cover. */ });
    });
    observer.observe(tile);
    return () => { current = false; observer.disconnect(); };
  });
</script>

<span bind:this={tile} class="cover">
  {#if src}
    <img src={src} alt="" loading="lazy" decoding="async" draggable="false"
      onerror={() => { if (src === image) failed = image; else alternate = null; }} />
  {:else}
    <Icon name="note" {size} />
  {/if}
</span>

<style>
  .cover { display: grid; width: 100%; height: 100%; place-items: center; border-radius: inherit; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: contain; }
</style>
