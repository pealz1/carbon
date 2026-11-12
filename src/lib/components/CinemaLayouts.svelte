<script lang="ts">
  import type { CinemaLayout } from "$lib/native";

  // The four cinema layouts as small drawn previews. Used by cinema's bar and by Settings.
  let { value, onpick }: { value: CinemaLayout; onpick: (layout: CinemaLayout) => void } = $props();

  const LAYOUTS: { id: CinemaLayout; label: string }[] = [
    { id: "split", label: "Cover and lyrics" },
    { id: "lyrics", label: "Lyrics" },
    { id: "cover", label: "Cover" },
    { id: "ambient", label: "Ambient" },
  ];
</script>

<div class="layouts" role="radiogroup" aria-label="Cinema layout">
  {#each LAYOUTS as layout (layout.id)}
    <button class="layout" role="radio" aria-checked={value === layout.id} onclick={() => onpick(layout.id)}>
      <span class="sketch {layout.id}" aria-hidden="true"><i class="art"></i><i class="a"></i><i class="b"></i><i class="c"></i></span>
      <span class="name">{layout.label}</span>
    </button>
  {/each}
</div>

<style>
  .layouts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 84px));
    gap: var(--sp-2);
  }

  .layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 6px var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .layout:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .layout[aria-checked="true"] {
    color: var(--text);
  }

  .name {
    font-size: var(--fs-micro);
    font-weight: 600;
    text-align: center;
    line-height: 1.2;
  }

  /* A 64 × 40 screen with the layout drawn in blocks: art squares and lyric lines. */
  .sketch {
    position: relative;
    width: 64px;
    height: 40px;
    border-radius: var(--r-sm);
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    transition: box-shadow var(--dur-fast);
  }

  .layout[aria-checked="true"] .sketch {
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .sketch i {
    position: absolute;
    border-radius: 1px;
    background: currentColor;
    opacity: 0.55;
  }

  .layout[aria-checked="true"] .sketch i {
    opacity: 0.9;
  }

  .sketch .art {
    border-radius: 2px;
  }

  .split .art { left: 7px; top: 10px; width: 18px; height: 18px; }
  .split .a { left: 31px; top: 13px; width: 24px; height: 3px; }
  .split .b { left: 31px; top: 19px; width: 20px; height: 3px; }
  .split .c { left: 31px; top: 25px; width: 14px; height: 2px; }

  .lyrics .art { left: 28px; top: 5px; width: 8px; height: 8px; }
  .lyrics .a { left: 14px; top: 17px; width: 36px; height: 3px; }
  .lyrics .b { left: 18px; top: 23px; width: 28px; height: 3px; }
  .lyrics .c { left: 22px; top: 29px; width: 20px; height: 2px; }

  .cover .art { left: 20px; top: 5px; width: 24px; height: 24px; }
  .cover .a { left: 24px; top: 32px; width: 16px; height: 2px; }
  .cover .b,
  .cover .c { display: none; }

  .ambient .art { left: 6px; top: 26px; width: 8px; height: 8px; }
  .ambient .a { left: 17px; top: 27px; width: 18px; height: 3px; }
  .ambient .b { left: 17px; top: 32px; width: 11px; height: 2px; }
  .ambient .c { display: none; }
</style>
