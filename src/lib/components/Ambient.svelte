<script lang="ts">
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import { artTones } from "$lib/art-tones.svelte";
  import { featuresFor, type AudioFeatures } from "$lib/audio-features";
  import { followSpectrum } from "$lib/local/spectrum";
  import { onScreen } from "$lib/on-screen.svelte";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { bassLevel, breathSeconds, pace, smooth } from "$lib/song-pulse";
  import { css } from "$lib/wallpaper";
  import CiderArtworkBackground from "./CiderArtworkBackground.svelte";

  // The window's wallpaper uses four colour fields, with a blurred layer for local artwork.
  // The colour fields cross-fade when the song changes. Only transform and opacity animate.
  // Reactive: the fields drift with the song's tempo, energy and volume, the light breathes once a
  // bar, and local files add their real bass. Cinema moves faster and keeps its light in every theme.
  let { image, playing, reactive = false, cinema = false }: { image: string | null; playing: boolean; reactive?: boolean; cinema?: boolean } = $props();
  const tones = artTones(() => image);

  const style = $derived(tones.current ? tones.current.fields.map((f, i) => `--f${i}: ${css(f)}`).join("; ") : null);

  /** How fast the fields drift before the song's pace applies: the window's wallpaper, and cinema. */
  const WINDOW_DRIFT = 1.5;
  const CINEMA_DRIFT = 2.4;
  /** Fixed themes draw the chrome in one colour, so only these (and cinema) show the wash at all. */
  const LIT_THEMES = new Set(["dynamic", "dynamic-oled"]);
  const BREATH_MS = breathSeconds(null) * 1000;
  let wallpaper = $state<HTMLElement>();
  let pulse = $state<HTMLElement>();
  let features = $state<AudioFeatures | null>(null);
  const lit = $derived(cinema || LIT_THEMES.has(prefs.value?.theme ?? "dynamic"));
  const live = $derived(reactive && lit && onScreen.current && !prefersReducedMotion.current && prefs.effects === "full" && prefs.motion !== "none");

  $effect(() => {
    const id = live && player.source === "spotify" ? player.track?.id : undefined;
    features = null;
    if (!id) return;
    let current = true;
    void featuresFor(id).then((f) => current && (features = f));
    return () => (current = false);
  });

  const input = $derived({ tempo: features?.tempo ?? null, energy: features?.energy ?? null, volume: player.volume, playing });

  // Rates change smoothly on running animations; changing a CSS duration would make the fields jump.
  $effect(() => {
    if (!live || !wallpaper) return;
    const rate = (cinema ? CINEMA_DRIFT : WINDOW_DRIFT) * pace(input);
    void style; // a new song's wash brings new animations
    const el = wallpaper;
    void tick().then(() => {
      for (const a of el.getAnimations({ subtree: true })) if (a instanceof CSSAnimation && a.animationName.startsWith("drift")) a.updatePlaybackRate(rate);
    });
  });

  let breath = $state<Animation | null>(null);
  $effect(() => {
    if (!live || !pulse) return;
    const a = pulse.animate([{ transform: "scale(1)", opacity: 0.86 }, { transform: "scale(1.045)", opacity: 1 }], {
      duration: BREATH_MS,
      iterations: Infinity,
      direction: "alternate",
      easing: "ease-in-out",
    });
    breath = a;
    return () => {
      a.cancel();
      breath = null;
    };
  });
  $effect(() => breath?.updatePlaybackRate(input.playing ? BREATH_MS / 1000 / breathSeconds(input.tempo) : 0.25));

  $effect(() => {
    if (!live || !pulse || player.source !== "local" || !playing) return;
    const el = pulse;
    let level = 0;
    const stop = followSpectrum((bands) => {
      level = smooth(level, bassLevel(bands));
      el.style.scale = String(1 + 0.07 * level);
    });
    return () => {
      stop();
      el.style.scale = "";
    };
  });
</script>

<div class="wallpaper" class:paused={!onScreen.current || !playing} class:cinema aria-hidden="true" bind:this={wallpaper}>
  {#if image && player.source === "local" && lit && !cinema && prefs.effects === "full"}
    {#key image}
      <img class="backdrop-art" src={image} alt="" decoding="async" in:fade={{ duration: 1000 }} out:fade={{ duration: 1000 }} />
    {/key}
  {/if}
  <div class="pulse" bind:this={pulse}>
  {#key style}
    {#if style}
      <div class="wash" class:dim={!playing} {style} in:fade={{ duration: 1400 }} out:fade={{ duration: 1400 }}>
        <span class="field a"></span>
        <span class="field b"></span>
        <span class="field c"></span>
        <span class="field d"></span>
      </div>
    {/if}
  {/key}
  </div>
  {#if cinema && image && !prefersReducedMotion.current && prefs.effects === "full" && prefs.motion !== "none"}
    <CiderArtworkBackground {image} paused={!playing || !onScreen.current} bpm={features?.tempo ?? null} />
  {/if}
  <div class="vignette"></div>
  <div class="grain"></div>
</div>

<style>
  .wallpaper {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: var(--chrome-bg);
  }

  /* Fixed themes draw the chrome in one colour; cinema keeps the artwork's light in every theme. */
  :global([data-theme]:not([data-theme="dynamic"], [data-theme="dynamic-oled"])) .wallpaper:not(.cinema) .wash {
    display: none;
  }

  /* Dynamic black: true black until music plays, then the light fades up; paused, it fades away. */
  :global([data-theme="dynamic-oled"]) .wallpaper:not(.cinema) .wash {
    transition-duration: 1600ms;
  }

  :global([data-theme="dynamic-oled"]) .wallpaper:not(.cinema) .wash.dim {
    opacity: 0;
  }

  .pulse,
  .wash,
  .grain,
  .vignette {
    position: absolute;
    inset: 0;
  }

  .backdrop-art {
    position: absolute;
    inset: -12%;
    width: 124%;
    height: 124%;
    object-fit: cover;
    opacity: 0.48;
    filter: blur(78px) saturate(1.42) brightness(0.57);
  }

  .paused .backdrop-art {
    opacity: 0.22;
  }

  :global([data-theme="dynamic-oled"]) .paused .backdrop-art { opacity: 0; }

  .vignette {
    display: none;
    background: radial-gradient(ellipse at 50% 44%, transparent 35%, rgb(0 0 0 / 0.52) 100%);
  }

  .wallpaper:has(.wash):not(.cinema) .vignette { display: block; }

  :global([data-theme]:not([data-theme="dynamic"], [data-theme="dynamic-oled"])) .wallpaper:not(.cinema) .vignette,
  :global([data-effects="minimal"]) .vignette {
    display: none;
  }

  /* Bass scales from the middle; the engine's ~30 updates a second glide into each other. */
  .pulse {
    transition: scale 120ms linear;
  }

  /* The deepest tone fills the gaps between fields, so the chrome reads as one continuous wash. */
  .wash {
    background: var(--f2);
    transition: opacity var(--dur-slow) var(--ease-out);
  }

  .wallpaper:not(.cinema) .wash {
    background: color-mix(in srgb, var(--f2) 68%, transparent);
  }

  :global([data-effects="minimal"]) .wallpaper:not(.cinema) .wash {
    background: var(--f2);
  }

  /* Paused keeps the colour but lowers it, so the frame itself says whether music is playing. */
  .wash.dim {
    opacity: 0.55;
  }

  /* Each field is drawn at half size and scaled 2x: a soft gradient loses nothing, and the GPU
     composites a quarter of the pixels every frame. */
  .field {
    position: absolute;
    width: 38vmax;
    height: 38vmax;
    border-radius: 50%;
    transform: scale(2);
    will-change: transform;
  }

  .a {
    left: -14vmax;
    top: -20vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-a 62s ease-in-out infinite alternate;
  }

  .b {
    right: -15vmax;
    top: -12vmax;
    background: radial-gradient(closest-side, var(--f1), transparent);
    animation: drift-b 78s ease-in-out infinite alternate;
  }

  .c {
    left: -16vmax;
    bottom: -11vmax;
    background: radial-gradient(closest-side, var(--f3), transparent);
    animation: drift-c 70s ease-in-out infinite alternate;
  }

  .d {
    right: -16vmax;
    bottom: -23vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-d 86s ease-in-out infinite alternate;
  }

  /* Each field wanders through three places instead of sliding between two, so the light pools,
     parts and crosses rather than swaying. */
  @keyframes drift-a {
    33% {
      transform: translate3d(22vmax, 6vmax, 0) scale(2.3);
    }

    66% {
      transform: translate3d(10vmax, 20vmax, 0) scale(1.75);
    }

    100% {
      transform: translate3d(30vmax, 12vmax, 0) scale(2.15);
    }
  }

  @keyframes drift-b {
    33% {
      transform: translate3d(-26vmax, 12vmax, 0) scale(1.75);
    }

    66% {
      transform: translate3d(-8vmax, 22vmax, 0) scale(2.35);
    }

    100% {
      transform: translate3d(-30vmax, 4vmax, 0) scale(1.9);
    }
  }

  @keyframes drift-c {
    33% {
      transform: translate3d(18vmax, -10vmax, 0) scale(2.35);
    }

    66% {
      transform: translate3d(30vmax, -2vmax, 0) scale(1.8);
    }

    100% {
      transform: translate3d(8vmax, -18vmax, 0) scale(2.2);
    }
  }

  @keyframes drift-d {
    33% {
      transform: translate3d(-24vmax, -6vmax, 0) scale(1.8);
    }

    66% {
      transform: translate3d(-10vmax, -20vmax, 0) scale(2.3);
    }

    100% {
      transform: translate3d(-28vmax, -14vmax, 0) scale(1.95);
    }
  }

  .paused .field {
    animation-play-state: paused;
  }

  /* Film grain: on the wallpaper, so it shows on the chrome and never on artwork above it. */
  .grain {
    background-image: var(--grain);
    opacity: 0.52;
  }

  /* Balanced: the same light, standing still. */
  :global([data-effects="balanced"]) .field {
    animation: none;
  }

  /* Minimal: one flat tone, no fields, no grain. */
  :global([data-effects="minimal"]) .field,
  :global([data-effects="minimal"]) .grain {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .field {
      animation: none;
    }
  }
</style>
