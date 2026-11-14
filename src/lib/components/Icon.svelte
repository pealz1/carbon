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
    more: "M4 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM10.4 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0zM16.8 12a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    pin: "M9 4h6l-1 6 3 3v1H7v-1l3-3zM12 14v6",
    folder: "M4 7a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    tag: "M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8zM8.5 8.5h.01",
    edit: "M5 19h4L19 9l-4-4L5 15zM13 7l4 4",
    trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
    album: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    artist: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
    down: "M6 9l6 6 6-6",
    screen: "M4 5h16v11H4zM9 20h6M12 16v4",
    keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
    equalizer: "M6 4v16M12 4v16M18 4v16M3.5 14h5M9.5 8h5M15.5 16h5",
    listAdd: "M4 6h11M4 11h11M4 16h7M17 14v6M14 17h6",
    up: "M6 15l6-6 6 6",
    sidebar: "M4 5.5h16v13H4zM9.5 5.5v13",
    layouts: "M4 5h7v8H4zM13 5h7v5h-7zM13 12h7v7h-7zM4 15h7v4H4z",
    pip: "M4 5h16v14H4zM12 12h6v5h-6z",
    note: "M9 17.5V6.5l10-2v11M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
    calendar: "M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4",
    clock: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4.5l3 2",
    block: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM6.4 6.4l11.2 11.2",
    moon: "M19.5 14.8A7.5 7.5 0 0 1 9.2 4.5a7.5 7.5 0 1 0 10.3 10.3z",
    devices: "M3 5h12v9H3zM6 18h6M9 14v4M17.5 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM18.75 17h.01",
    speaker: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 7h.01",
    phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
    restore: "M8.5 8.5h10v10h-10zM5.5 15.5v-10h10",
    export: "M12 15V4.5M7.5 9 12 4.5 16.5 9M5 14v5h14v-5",
    import: "M12 4.5V15M7.5 10.5 12 15l4.5-4.5M5 14v5h14v-5",
    sort: "M7 5v14M4 16l3 3 3-3M13 7h7M13 12h5M13 17h3",
    duplicate: "M9 9h10v10H9zM5 15V5h10",
    spark: "M11 4l1.9 5.1L18 11l-5.1 1.9L11 18l-1.9-5.1L4 11l5.1-1.9zM18 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z",
    chart: "M5 20V11M12 20V4M19 20v-6",
    speed: "M5.2 17.5a8.2 8.2 0 1 1 13.6 0M12 13.5l3.6-4.2",
    radio: "M5 9h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 9l10-5M8.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM14 13h3.5M14 16h3.5",
    podcast: "M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V20",
    cloud: "M7 18.5a4 4 0 0 1-.6-7.95 5.5 5.5 0 0 1 10.7 1.1A3.5 3.5 0 0 1 17 18.5z",
    refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
    star: "M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z",
    bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4.2L6 20V5a1 1 0 0 1 1-1z",
    stack: "M4 9l8-4.5L20 9l-8 4.5zM4 13l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5",
    signout: "M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9",
    together: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3a5.5 5.5 0 0 1 3 4.7",
    settings:
      "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.9 1.1l-.3 2h-3.6l-.3-2a7 7 0 0 1-1.9-1.1l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 1.8-3.1 1.9.7a7 7 0 0 1 1.9-1.1l.3-2h3.6l.3 2a7 7 0 0 1 1.9 1.1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 3z",
  } as const;
  const FILLED = new Set(["play", "pause", "next", "prev", "more"]);
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
