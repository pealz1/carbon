<script lang="ts">
  import type { Snippet } from "svelte";
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import Icon from "./Icon.svelte";

  let {
    kind,
    title,
    image,
    meta,
    playUri,
    round = false,
    shuffleCount,
    menuItems,
    children,
  }: {
    kind: string;
    title: string;
    image: string | null;
    meta?: Snippet;
    playUri?: string;
    round?: boolean;
    /** Number of songs, so a shuffle can start on a random one. */
    shuffleCount?: number;
    /** Items for the "…" menu. */
    menuItems?: () => MenuEntry[];
    children?: Snippet;
  } = $props();

  const live = $derived(!!playUri && player.contextUri === playUri);
  const playing = $derived(live && !player.paused);

  function play() {
    if (!playUri) return;
    if (live) player.togglePlay();
    else player.playContext(playUri);
  }
</script>

<header class="detail">
  <div class="art" class:round>
    {#if image}
      <img src={image} alt="" width="232" height="232" />
      <img src={image} alt="" width="232" height="232" class="reflection" aria-hidden="true" />
    {:else}
      <div class="placeholder"><Icon name="heart" size={64} filled /></div>
    {/if}
  </div>
  <div class="info">
    <span class="eyebrow">{kind}</span>
    <h1 class:long={title.length > 28}>{title}</h1>
    {#if meta}<div class="meta">{@render meta()}</div>{/if}
    <div class="actions">
      {#if playUri}
        <button class="play" onclick={play} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={22} />
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        <button class="round" onclick={() => player.shufflePlay(playUri!, shuffleCount)} aria-label="Shuffle play" title="Shuffle play">
          <Icon name="shuffle" size={20} />
        </button>
      {/if}
      {@render children?.()}
      {#if menuItems}
        <button class="round" onclick={(e) => menu.open(e, menuItems())} aria-label="More options for {title}" aria-haspopup="menu" title="More">
          <Icon name="more" size={20} />
        </button>
      {/if}
    </div>
  </div>
</header>

<style>
  .detail {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--sp-2) var(--sp-6);
  }

  .art {
    position: relative;
    width: 232px;
    flex: none;
  }

  .art img,
  .placeholder {
    width: 232px;
    height: 232px;
    border-radius: var(--r-lg);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .round img,
  .round .placeholder {
    border-radius: var(--r-pill);
  }

  /* Glassy floor reflection under the artwork. */
  .reflection {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 6px;
    transform: scaleY(-1);
    opacity: 0.22;
    mask-image: linear-gradient(to top, black, transparent 35%);
    box-shadow: none;
    pointer-events: none;
  }

  .placeholder {
    display: grid;
    place-items: center;
    color: var(--accent-ink);
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
  }

  h1 {
    font-size: var(--fs-hero);
    font-weight: 750;
    line-height: 0.98;
    overflow-wrap: anywhere;
  }

  h1.long {
    font-size: var(--fs-title);
    line-height: 1.05;
  }

  .meta {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-3);
  }

  .play {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 46px;
    padding: 0 var(--sp-5) 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    box-shadow: 0 14px 30px -12px var(--accent-glow);
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .play:hover {
    transform: scale(1.04);
  }

  .play:active {
    transform: scale(0.96);
  }

  .round {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--glass);
    border: 1px solid var(--glass-edge);
    color: var(--text-muted);
    transition:
      color var(--dur-fast),
      transform var(--dur-fast) var(--ease-spring);
  }

  .round:hover {
    color: var(--text);
    transform: scale(1.06);
  }

  .round:active {
    transform: scale(0.94);
  }
</style>
