<script lang="ts">
  // Settings → Sound: the way to the Sound page, the volume control and interface sounds.
  import Toggle from "$lib/components/Toggle.svelte";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { playSound } from "$lib/sfx";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  const s = $derived(prefs.value);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  async function setCurve(on: boolean) {
    if (await prefs.update({ volumeCurve: on })) player.setVolume(player.volume);
  }
</script>

{#if s}
  <Group heading="Audio">
    <Row label="Equalizer, boost, loudness and crossfade" keywords="eq equaliser bass treble boost normalise normalize device speakers headphones gapless compressor spotify youtube">
      <a class="pill" href="/sound">Open Sound</a>
    </Row>
  </Group>

  <Group heading="Volume">
    <Row as="label" label="Volume change per scroll notch" value={percent(s.volumeStep)} keywords="mouse wheel step">
      <input
        type="range"
        min="0.01"
        max="0.25"
        step="0.01"
        value={s.volumeStep}
        aria-valuetext={percent(s.volumeStep)}
        onchange={(e) => prefs.update({ volumeStep: Number(e.currentTarget.value) })}
      />
    </Row>
    <Toggle checked={s.volumeCurve} label="Finer control at low volume" keywords="curve logarithmic quiet" onchange={setCurve} />
  </Group>

  <Group heading="Interface sounds">
    <Toggle
      checked={s.uiSounds}
      label="Play interface sounds"
      description="Silent while Spotify is playing."
      keywords="ui sfx clicks taps chimes feedback"
      onchange={async (v) => (await prefs.update({ uiSounds: v })) && v && playSound("toggle-on")}
    />
    <Row as="label" label="Interface sound volume" value={percent(s.uiSoundVolume)} disabled={!s.uiSounds} keywords="ui sfx loudness">
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={s.uiSoundVolume}
        disabled={!s.uiSounds}
        onchange={async (e) => (await prefs.update({ uiSoundVolume: Number(e.currentTarget.value) })) && playSound("select")}
      />
    </Row>
  </Group>
{/if}
