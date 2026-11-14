<script lang="ts">
  import type { Snippet } from "svelte";
  import { onScreen } from "$lib/on-screen.svelte";
  import { streamName } from "$lib/stream/uri";
  import { formatDuration, joinNames } from "$lib/format";
  import type { NowSource, Source } from "$lib/popout/now";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Slider from "./Slider.svelte";

  // The mini player: artwork, song, progress and transport in a window small enough to keep on top.
  // Used by the mini player pop-out (mirroring the main player) and by compact mode, which passes
  // `video` so YouTube's player takes the artwork's place. Artwork is shown whole, never covered.
  let {
    now,
    video,
    expandLabel,
    onexpand,
    onclose,
  }: { now: NowSource; video?: Snippet; expandLabel: string; onexpand: () => unknown; onclose?: () => unknown } = $props();

  const TICK_MS = 250;
  const SOURCE_LABEL: Record<Source, string> = { spotify: "Spotify", youtube: "YouTube Music", local: "On this PC", radio: "Radio", server: "Your server" };
  let position = $state(0);
  const showVideo = $derived(!!video && now.source === "youtube");
  const art = $derived(now.track?.album?.image ?? null);

  $effect(() => {
    if (!onScreen.current) return;
    const timer = setInterval(() => (position = now.position()), TICK_MS);
    return () => clearInterval(timer);
  });
</script>

<section class="mini" class:video={showVideo} aria-label="Mini player" data-tauri-drag-region="deep">
  <div class="layout">
    <div class="art">
      {#if showVideo}
        {@render video?.()}
      {:else if art}
        <img src={art} alt="" draggable="false" />
      {:else}
        <span class="blank">{#if now.track}<Icon name="note" size={26} />{:else}<Logo size={26} />{/if}</span>
      {/if}
    </div>
    <div class="body">
      <div class="head">
        <div class="meta">
          <p class="title">{now.track?.name ?? "Nothing playing"}</p>
          <p class="sub">{now.track ? joinNames(now.track.artists) : "Play something in Carbon"}</p>
        </div>
        <div class="tools">
          <button class="tool" onclick={onexpand} aria-label={expandLabel} title={expandLabel}><Icon name="expand" size={14} /></button>
          {#if onclose}
            <button class="tool" onclick={onclose} aria-label="Close the mini player" title="Close"><Icon name="close" size={14} /></button>
          {/if}
        </div>
      </div>
      <Slider
        value={position}
        max={now.durationMs}
        step={1000}
        tone="accent"
        label="Seek"
        valuetext="{formatDuration(position)} of {formatDuration(now.durationMs)}"
        oncommit={(ms) => now.seek(ms)}
      />
      <div class="foot">
        <div class="transport">
          <button class="ctl" onclick={() => now.previous()} aria-label="Previous" title="Previous"><Icon name="prev" size={18} /></button>
          <button class="ctl play" onclick={() => now.togglePlay()} aria-label={now.paused ? "Play" : "Pause"}>
            <Icon name={now.paused ? "play" : "pause"} size={22} />
          </button>
          <button class="ctl" onclick={() => now.next()} aria-label="Next" title="Next"><Icon name="next" size={18} /></button>
        </div>
        {#if now.track}<span class="source">{now.source === "server" ? streamName(now.track.uri) : SOURCE_LABEL[now.source]}</span>{/if}
      </div>
    </div>
  </div>
</section>

<style>
  /* Side by side when wide; artwork on top once the window is taller than it is wide. */
  .mini {
    --pad: var(--sp-3);
    position: relative;
    z-index: 1;
    height: 100vh;
    color: var(--chrome-text);
    container: mini / size;
  }

  .layout {
    height: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--pad);
  }

  .art {
    --art: min(168px, calc(100vh - 2 * var(--pad)));
    flex: none;
    width: var(--art);
    height: var(--art);
  }

  .art img,
  .blank {
    width: 100%;
    height: 100%;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--chrome-field);
    color: var(--chrome-text-muted);
    box-shadow: none;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .head,
  .foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .meta {
    flex: 1;
    min-width: 0;
  }

  .title,
  .sub {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    font-size: var(--fs-lead);
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .sub {
    margin-top: 2px;
    font-size: var(--fs-small);
    color: var(--chrome-text-muted);
  }

  .tools {
    align-self: flex-start;
    display: flex;
    gap: 2px;
    margin: -4px -4px 0 0;
  }

  .tool,
  .ctl {
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--chrome-text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .tool {
    width: 26px;
    height: 26px;
  }

  .ctl {
    width: 34px;
    height: 34px;
  }

  .tool:hover,
  .ctl:hover {
    color: var(--chrome-text);
    background: var(--chrome-hover);
  }

  .ctl.play {
    width: 40px;
    height: 40px;
    color: var(--ink);
    background: var(--paper);
  }

  .ctl.play:hover {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 0 0 4px var(--chrome-hover);
  }

  .transport {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin-left: -6px;
  }

  .source {
    margin-left: auto;
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--chrome-text-muted);
  }

  @container mini (orientation: portrait) and (min-height: 300px) {
    .layout {
      flex-direction: column;
      align-items: stretch;
    }

    .art {
      --art: min(calc(100cqw - 2 * var(--pad)), calc(100cqh - 150px));
      align-self: center;
    }
  }

  /* Compact mode with YouTube Music: the video (16:9, at least 200 px tall) above the controls. */
  .video .layout {
    flex-direction: column;
    align-items: stretch;
  }

  .video .art {
    width: 100%;
    height: auto;
  }
</style>
