<script lang="ts">
  import { DEFAULT_VOLUME } from "$lib/config";
  import { player } from "$lib/player.svelte";
  import { wheelVolume } from "$lib/volume-wheel";
  import Icon from "./Icon.svelte";
  import Slider from "./Slider.svelte";

  // Cinema's volume: click to mute (and back to where it was), scroll to adjust, and a slider that
  // rises above the button on hover or keyboard focus.
  let before = DEFAULT_VOLUME;
  const percent = $derived(Math.round(player.volume * 100));

  function mute() {
    if (player.volume > 0) {
      before = player.volume;
      player.setVolume(0);
    } else player.setVolume(before || DEFAULT_VOLUME);
  }
</script>

<div class="volume" onwheel={wheelVolume}>
  <button class="ctl" onclick={mute} aria-label={player.volume > 0 ? "Mute" : "Unmute"}>
    <Icon name={player.volume > 0 ? "volume" : "mute"} size={18} />
  </button>
  <div class="panel glass">
    <Slider value={player.volume} max={1} step={0.01} label="Volume" valuetext="{percent}%" oncommit={player.setVolume} onpreview={player.setVolume} />
    <span class="value tabular">{percent}%</span>
  </div>
</div>

<style>
  .volume {
    position: relative;
    display: flex;
  }

  .panel {
    position: absolute;
    right: -48px;
    bottom: calc(100% + var(--lift, 0px) + var(--sp-3));
    z-index: 2;
    width: 176px;
    display: none;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pill);
    animation: rise var(--dur-fast) var(--ease-out);
  }

  /* Bridges the gap above the button. */
  .panel::after {
    content: "";
    position: absolute;
    inset: 100% 0 calc(-1 * (var(--lift, 0px) + var(--sp-3)));
  }

  .volume:hover .panel,
  .volume:focus-within .panel {
    display: flex;
  }

  .value {
    width: 34px;
    font-size: var(--fs-caption);
    color: var(--text-muted);
    text-align: right;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
