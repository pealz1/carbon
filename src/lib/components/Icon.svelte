<script lang="ts" module>
  // Hand-drawn 24px icon set (no icon dependency). Stroke icons unless listed in FILLED.
  const PATHS = {
    home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
    search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.2 15.2 20 20",
    library: "M5 4v16M9.5 4v16M14 5l5 14.5",
    heart: "M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z",
    play: "M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z",
    pause: "M7 5h3.2v14H7zM13.8 5H17v14h-3.2z",
    next: "M6 5.5v13l9-6.5zM17.5 5v14",
    prev: "M18 5.5v13l-9-6.5zM6.5 5v14",
    shuffle: "M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.3 3.4-3M20 7h-3.5c-1.6 0-2.6 1.3-3.4 3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5",
    repeat: "M5 11V9a3 3 0 0 1 3-3h11M16 3l3 3-3 3M19 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3",
    volume: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
    mute: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5",
    lyrics: "M5 5h14v10H9l-4 4zM9 9h6M9 12h4",
    queue: "M4 6h12M4 11h12M4 16h7M15 15.5v-1l5 3-5 3z",
    back: "M14.5 5 8 12l6.5 7",
    forward: "M9.5 5 16 12l-6.5 7",
    minimize: "M6 12h12",
    maximize: "M6.5 6.5h11v11h-11z",
    close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
    expand: "M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7",
    collapse: "M19 5l-6 6M13 6v5h5M5 19l6-6M11 18v-5H6",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5 10 17l9-10",
    folder: "M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z",
    equalizer: "M6 4v16M12 4v16M18 4v16M3.5 14h5M9.5 8h5M15.5 16h5",
    listAdd: "M4 6h11M4 11h11M4 16h7M17 14v6M14 17h6",
    up: "M6 15l6-6 6 6",
    down: "M6 9l6 6 6-6",
    trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
    signout: "M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9",
    settings:
      "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.9 1.1l-.3 2h-3.6l-.3-2a7 7 0 0 1-1.9-1.1l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 1.8-3.1 1.9.7a7 7 0 0 1 1.9-1.1l.3-2h3.6l.3 2a7 7 0 0 1 1.9 1.1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 3z",
  } as const;
  const FILLED = new Set(["play", "pause", "next", "prev"]);
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 20, filled = false, label }: { name: IconName; size?: number; filled?: boolean; label?: string } = $props();
  const fill = $derived(filled || FILLED.has(name));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={fill ? "currentColor" : "none"}
  stroke={fill ? "none" : "currentColor"}
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  <path d={PATHS[name]} />
</svg>
