<script lang="ts">
  import { tick } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { SOURCE_NAMES, SOURCES } from "$lib/lyrics/sources.svelte";
  import type { ChineseScript, LyricsSource, RomanPlace, Settings } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  // Settings → Lyrics: the soft blur on distant lines, where lyrics are looked up, translation and
  // romanisation defaults. Each song can still be switched from the lyrics view.
  let { settings: s }: { settings: Settings } = $props();

  const SOURCE_NOTES: Record<LyricsSource, string> = {
    lrclib: "Open and community-run. Often has word-by-word timing.",
    youtube: "YouTube Music's own lyrics, for its songs: timed to the exact recording.",
    netease: "Unofficial. Strong on Chinese, Japanese and Korean songs, with Chinese translations.",
    musixmatch: "Unofficial, and it often refuses for a while. Word-by-word timing when it answers.",
  };
  /** Codes Google's translator takes; zh-CN also uses NetEase's own translations. */
  const LANGUAGES: [code: string, name: string][] = [
    ["en", "English"],
    ["es", "Spanish"],
    ["fr", "French"],
    ["de", "German"],
    ["it", "Italian"],
    ["pt", "Portuguese"],
    ["nl", "Dutch"],
    ["pl", "Polish"],
    ["tr", "Turkish"],
    ["ru", "Russian"],
    ["uk", "Ukrainian"],
    ["ar", "Arabic"],
    ["hi", "Hindi"],
    ["id", "Indonesian"],
    ["vi", "Vietnamese"],
    ["th", "Thai"],
    ["ja", "Japanese"],
    ["ko", "Korean"],
    ["zh-CN", "Chinese (Simplified)"],
    ["zh-TW", "Chinese (Traditional)"],
  ];
  /** The sources that are on, in the order they're asked, then the ones that are off. */
  const sourceRows = $derived([...s.lyricsSources, ...SOURCES.filter((id) => !s.lyricsSources.includes(id))]);

  const toggleSource = (id: LyricsSource, on: boolean) =>
    prefs.update({ lyricsSources: on ? [...s.lyricsSources, id] : s.lyricsSources.filter((other) => other !== id) });

  /** Moves a source one place; the pressed button keeps the focus so it can be pressed again. */
  async function moveSource(id: LyricsSource, by: -1 | 1, button: HTMLButtonElement) {
    const order = s.lyricsSources.filter((other) => other !== id);
    order.splice(s.lyricsSources.indexOf(id) + by, 0, id);
    await prefs.update({ lyricsSources: order });
    await tick();
    (button.disabled ? button.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)") : button)?.focus();
  }

  const PLACES: { id: RomanPlace; label: string }[] = [
    { id: "below", label: "Under each line" },
    { id: "instead", label: "Instead of the line" },
  ];
  const DELAY_STEP_MS = 50;
  const MAX_DELAY_MS = 1000;
  const delayText = (ms: number) => (ms === 0 ? "none" : `${Math.abs(ms)} ms ${ms > 0 ? "later" : "sooner"}`);
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
  <label class="range">
    <span class="eyebrow">Lyrics delay: {delayText(s.lyricsDelayMs)}</span>
    <input
      type="range"
      min={-MAX_DELAY_MS}
      max={MAX_DELAY_MS}
      step={DELAY_STEP_MS}
      value={s.lyricsDelayMs}
      aria-describedby="lyrics-delay-help"
      onchange={(e) => prefs.update({ lyricsDelayMs: Number(e.currentTarget.value) })}
    />
    <span id="lyrics-delay-help" class="muted">For Bluetooth headphones and speakers that play a moment late: move right until the words land with the voice. Applies to every song; each song keeps its own nudge in the lyrics view.</span>
  </label>
  <p class="eyebrow" id="lyrics-sources-title">Where lyrics come from</p>
  <ol class="sources" aria-labelledby="lyrics-sources-title" aria-describedby="lyrics-sources-help">
    {#each sourceRows as id, i (id)}
      {@const on = s.lyricsSources.includes(id)}
      <li class:off={!on}>
        <div class="order">
          <button disabled={!on || i === 0} onclick={(e) => moveSource(id, -1, e.currentTarget)} aria-label="Ask {SOURCE_NAMES[id]} earlier" title="Ask earlier">
            <Icon name="up" size={14} />
          </button>
          <button disabled={!on || i >= s.lyricsSources.length - 1} onclick={(e) => moveSource(id, 1, e.currentTarget)} aria-label="Ask {SOURCE_NAMES[id]} later" title="Ask later">
            <Icon name="down" size={14} />
          </button>
        </div>
        <Toggle checked={on} disabled={on && s.lyricsSources.length === 1} label={SOURCE_NAMES[id]} description={SOURCE_NOTES[id]} onchange={(v) => toggleSource(id, v)} />
      </li>
    {/each}
  </ol>
  <span id="lyrics-sources-help" class="muted">Asked from the top down; word-by-word timing beats line timing, which beats plain text. NetEase and Musixmatch are those apps' own services rather than public ones: using them may be against their terms, and they can stop working. Any song can be switched to one source from the lyrics view.</span>
  <label class="range">
    <span class="eyebrow">Translate lyrics into</span>
    <select value={s.lyricsTranslate} aria-describedby="lyrics-translate-help" onchange={(e) => prefs.update({ lyricsTranslate: e.currentTarget.value })}>
      <option value="">Don't translate</option>
      {#each LANGUAGES as [code, name] (code)}<option value={code}>{name}</option>{/each}
    </select>
    <span id="lyrics-translate-help" class="muted">Shows a translation under each line. The lines are sent to Google Translate, which may refuse now and then; lyrics from NetEase use its own Chinese translation. Switch it off for one song from the lyrics view.</span>
  </label>
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

  .range {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* Sources: a numbered order for the ones that are on; the ones that are off sit below, dimmed. */
  .sources {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: source;
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
  }

  .sources li {
    display: grid;
    grid-template-columns: 2ch auto 1fr;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
  }

  .sources li + li {
    box-shadow: inset 0 1px 0 var(--glass-edge);
  }

  .sources li::before {
    counter-increment: source;
    content: counter(source);
    font-family: var(--font-display);
    font-size: var(--fs-lead);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }

  .sources li.off::before {
    content: "–";
    color: var(--text-faint);
  }

  .sources li.off :global(.label) {
    color: var(--text-muted);
  }

  .order {
    display: flex;
    gap: 2px;
  }

  .order button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-press) var(--ease-out);
  }

  .order button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-active);
  }

  .order button:active:not(:disabled) {
    transform: scale(var(--press));
  }

  .order button:disabled {
    cursor: default;
    opacity: 0.3;
  }

  select {
    align-self: flex-start;
    min-width: 220px;
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.45;
  }
</style>
