<script lang="ts">
  import Toggle from "$lib/components/Toggle.svelte";
  import type { ChineseScript, RomanPlace, Settings } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  // Settings → Lyrics: the soft blur on distant lines and romanisation defaults. Each song can still
  // be switched from the lyrics view.
  let { settings: s }: { settings: Settings } = $props();

  const PLACES: { id: RomanPlace; label: string }[] = [
    { id: "below", label: "Under each line" },
    { id: "instead", label: "Instead of the line" },
  ];
  const CHINESE: { id: ChineseScript; label: string }[] = [
    { id: "original", label: "As written" },
    { id: "simplified", label: "Simplified" },
    { id: "traditional", label: "Traditional" },
  ];
</script>

<section class="panel plate">
  <h2>Lyrics</h2>
  <Toggle
    checked={s.lyricsBlur}
    label="Soften distant lines"
    description="Lines away from the one being sung blur slightly. Cinema's lyrics options change this too."
    onchange={(v) => prefs.update({ lyricsBlur: v })}
  />
  <Toggle
    checked={s.lyricsRomanise}
    label="Romanise lyrics"
    description="Rōmaji for Japanese, pinyin for Chinese and Revised Romanisation for Korean. Switch it for one song from the lyrics view."
    onchange={(v) => prefs.update({ lyricsRomanise: v })}
  />
  <p class="eyebrow">Romanisation</p>
  <div class="segmented" role="radiogroup" aria-label="Where romanisation goes">
    {#each PLACES as place (place.id)}
      <button role="radio" aria-checked={s.lyricsRomanPlace === place.id} class:active={s.lyricsRomanPlace === place.id} onclick={() => prefs.update({ lyricsRomanPlace: place.id })}>
        {place.label}
      </button>
    {/each}
  </div>
  <Toggle
    checked={s.lyricsFurigana}
    label="Furigana"
    description="Readings over kanji in Japanese lines while romanisation is on."
    onchange={(v) => prefs.update({ lyricsFurigana: v })}
  />
  <p class="eyebrow">Chinese characters</p>
  <div class="segmented" role="radiogroup" aria-label="Chinese characters">
    {#each CHINESE as script (script.id)}
      <button role="radio" aria-checked={s.lyricsChinese === script.id} class:active={s.lyricsChinese === script.id} onclick={() => prefs.update({ lyricsChinese: script.id })}>
        {script.label}
      </button>
    {/each}
  </div>
</section>

<style>
  /* Matches the other Settings groups (stage plates). */
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  h2 {
    margin-bottom: var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .eyebrow {
    margin: var(--sp-2) 0 0;
  }
</style>
