<script lang="ts">
  import { tick } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { t } from "$lib/i18n/locale.svelte";
  import { SOURCE_NAMES, SOURCES } from "$lib/lyrics/sources.svelte";
  import type { ChineseScript, LyricsSource, RomanPlace } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";

  // Settings → Lyrics: size, blur and delay, where lyrics are looked up, translation and
  // romanisation defaults. Each song can still be switched from the lyrics view.
  const SOURCE_NOTES: Record<LyricsSource, string> = {
    lrclib: "Open and community-run.",
    youtube: "Timed lyrics for YouTube Music songs.",
    netease: "Strong on Chinese, Japanese and Korean.",
    musixmatch: "Often refuses for a while.",
  };
  /** These are those apps' own services, not public ones: they can break, or be against their terms. */
  const UNOFFICIAL: ReadonlySet<LyricsSource> = new Set(["netease", "musixmatch"]);
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
  const PLACES: { id: RomanPlace; label: string }[] = [
    { id: "below", label: "Under each line" },
    { id: "instead", label: "Instead of the line" },
  ];
  const CHINESE: { id: ChineseScript; label: string }[] = [
    { id: "original", label: "As written" },
    { id: "simplified", label: "Simplified" },
    { id: "traditional", label: "Traditional" },
  ];
  const DELAY_STEP_MS = 50;
  const MAX_DELAY_MS = 1000;
  const delayText = (ms: number) => (ms === 0 ? t("Off") : `${Math.abs(ms)} ms ${t(ms > 0 ? "later" : "sooner")}`);

  const s = $derived(prefs.value);
  const sources = $derived(s?.lyricsSources ?? []);
  /** The sources that are on, in the order they're asked, then the ones that are off. */
  const sourceRows = $derived([...sources, ...SOURCES.filter((id) => !sources.includes(id))]);

  const toggleSource = (id: LyricsSource, on: boolean) => prefs.update({ lyricsSources: on ? [...sources, id] : sources.filter((other) => other !== id) });

  /** Moves a source one place; the pressed button keeps the focus so it can be pressed again. */
  async function moveSource(id: LyricsSource, by: -1 | 1, button: HTMLButtonElement) {
    const order = sources.filter((other) => other !== id);
    order.splice(sources.indexOf(id) + by, 0, id);
    await prefs.update({ lyricsSources: order });
    await tick();
    (button.disabled ? button.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)") : button)?.focus();
  }
</script>

{#if s}
  <Group heading="Display">
    <Row as="label" label="Lyrics size" value="{Math.round(s.lyricsScale * 100)}%" keywords="text bigger larger font scale">
      <input type="range" min="0.75" max="1.5" step="0.05" value={s.lyricsScale} onchange={(e) => prefs.update({ lyricsScale: Number(e.currentTarget.value) })} />
    </Row>
    <Toggle checked={s.lyricsBlur} label="Soften distant lines" description="Blurs lines away from the sung one." keywords="blur focus" onchange={(v) => prefs.update({ lyricsBlur: v })} />
    <Row as="label" label="Lyrics delay" value={delayText(s.lyricsDelayMs)} description="For Bluetooth audio that plays late." keywords="sync offset latency timing bluetooth">
      <input
        type="range"
        min={-MAX_DELAY_MS}
        max={MAX_DELAY_MS}
        step={DELAY_STEP_MS}
        value={s.lyricsDelayMs}
        aria-valuetext={delayText(s.lyricsDelayMs)}
        onchange={(e) => prefs.update({ lyricsDelayMs: Number(e.currentTarget.value) })}
      />
    </Row>
  </Group>

  <Group heading="Sources" message="Asked from the top down">
    <ol class="sources">
      {#each sourceRows as id, i (id)}
        {@const on = sources.includes(id)}
        <li class:off={!on}>
          <div class="order">
            <button disabled={!on || i === 0} onclick={(e) => moveSource(id, -1, e.currentTarget)} aria-label="Ask {SOURCE_NAMES[id]} earlier" title="Ask earlier">
              <Icon name="up" size={14} />
            </button>
            <button disabled={!on || i >= sources.length - 1} onclick={(e) => moveSource(id, 1, e.currentTarget)} aria-label="Ask {SOURCE_NAMES[id]} later" title="Ask later">
              <Icon name="down" size={14} />
            </button>
          </div>
          <Toggle
            checked={on}
            disabled={on && sources.length === 1}
            label={SOURCE_NAMES[id]}
            description={t(SOURCE_NOTES[id])}
            message={UNOFFICIAL.has(id) ? "Unofficial, may stop working" : undefined}
            keywords="lyrics source provider"
            onchange={(v) => toggleSource(id, v)}
          />
        </li>
      {/each}
    </ol>
  </Group>

  <Group heading="Translation and romanisation">
    <Row as="label" label="Translate lyrics into" description="Lines are sent to Google Translate." keywords="translation language english">
      <select value={s.lyricsTranslate} onchange={(e) => prefs.update({ lyricsTranslate: e.currentTarget.value })}>
        <option value="">Don't translate</option>
        {#each LANGUAGES as [code, name] (code)}<option value={code}>{name}</option>{/each}
      </select>
    </Row>
    <Toggle
      checked={s.lyricsRomanise}
      label="Romanise lyrics"
      description="Japanese, Chinese and Korean lyrics."
      keywords="romaji pinyin romanize romanization latin"
      onchange={(v) => prefs.update({ lyricsRomanise: v })}
    />
    <Row label="Show romanisation" keywords="romanize romanization position">
      <div class="segmented" role="radiogroup" aria-label="Where romanisation goes">
        {#each PLACES as place (place.id)}
          <button role="radio" aria-checked={s.lyricsRomanPlace === place.id} class:active={s.lyricsRomanPlace === place.id} onclick={() => prefs.update({ lyricsRomanPlace: place.id })}>
            {t(place.label)}
          </button>
        {/each}
      </div>
    </Row>
    <Toggle checked={s.lyricsFurigana} label="Furigana" description="Kanji readings while romanising." keywords="japanese kanji ruby" onchange={(v) => prefs.update({ lyricsFurigana: v })} />
    <Row label="Chinese characters" keywords="simplified traditional hanzi script">
      <div class="segmented" role="radiogroup" aria-label="Chinese characters">
        {#each CHINESE as script (script.id)}
          <button role="radio" aria-checked={s.lyricsChinese === script.id} class:active={s.lyricsChinese === script.id} onclick={() => prefs.update({ lyricsChinese: script.id })}>
            {t(script.label)}
          </button>
        {/each}
      </div>
    </Row>
  </Group>
{/if}

<style>
  /* Sources: a numbered order for the ones that are on; the ones that are off sit below, dimmed. */
  .sources {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: source;
  }

  .sources li {
    display: grid;
    grid-template-columns: 2ch auto 1fr;
    align-items: center;
    gap: var(--sp-3);
  }

  .sources li + li {
    border-top: 1px solid var(--glass-edge);
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
</style>
