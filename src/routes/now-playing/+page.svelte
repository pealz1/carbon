<script lang="ts">
  import LikeButton from "$lib/components/LikeButton.svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import Status from "$lib/components/Status.svelte";
  import { player } from "$lib/player.svelte";

  let tilt = $state({ x: 0, y: 0 });

  function onTilt(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tilt = { x: ((event.clientY - rect.top) / rect.height - 0.5) * -10, y: ((event.clientX - rect.left) / rect.width - 0.5) * 12 };
  }
</script>

<div class="stage">
  {#if player.track}
    <section class="art-side">
      <div class="cover-wrap" role="presentation" onpointermove={onTilt} onpointerleave={() => (tilt = { x: 0, y: 0 })}>
        {#if player.artwork}
          <img class="cover" src={player.artwork} alt="" width="440" height="440" style="transform: rotateX({tilt.x}deg) rotateY({tilt.y}deg)" />
        {/if}
      </div>
      <div class="title-row">
        <h1>{player.track.name}</h1>
        <LikeButton uri={player.track.uri} label={player.track.name} size={22} />
      </div>
      <p class="by">{player.track.artists.map((a) => a.name).join(", ")}</p>
      {#if player.track.album}<p class="album">{player.track.album.name}</p>{/if}
    </section>

    <Lyrics />
  {:else}
    <Status empty="Play something to see it here, with lyrics." />
  {/if}
</div>

<style>
  .stage {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.35fr);
    gap: var(--sp-7);
    height: calc(100vh - var(--titlebar-h) - var(--dock-h) - var(--sp-6));
    padding: var(--sp-5) var(--sp-4) 0;
  }

  .art-side {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .cover-wrap {
    perspective: 900px;
    margin-bottom: var(--sp-4);
  }

  .cover {
    width: 100%;
    max-width: 440px;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-lg);
    object-fit: cover;
    box-shadow: var(--shadow-art), 0 0 0 1px var(--glass-edge), 0 40px 120px -30px var(--accent-glow);
    transition: transform var(--dur-slow) var(--ease-out);
    will-change: transform;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .title-row :global(.like) {
    margin-top: var(--sp-1);
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 750;
    line-height: 1.05;
  }

  .by {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .album {
    margin: 0;
    color: var(--text-faint);
  }

</style>
