<script lang="ts">
  // Settings → Appearance: theme, colour and effects, language and fonts, and what the player shows.
  import { onMount } from "svelte";
  import CinemaSettings from "$lib/components/CinemaSettings.svelte";
  import FontPicker from "$lib/components/FontPicker.svelte";
  import ThemePicker from "$lib/components/ThemePicker.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { FONT_ROLES, type FontKey } from "$lib/fonts";
  import { activeLocale, languages, selectLocale, t, type Locale } from "$lib/i18n/locale.svelte";
  import { ACCENTS, installedFonts, type Effects, type Settings } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "./Group.svelte";
  import Row from "./Row.svelte";

  const EFFECTS: { id: Effects; label: string; hint: string }[] = [
    { id: "full", label: "Full", hint: "Moving colour, film grain and glass" },
    { id: "balanced", label: "Balanced", hint: "Still colour, grain and glass" },
    { id: "minimal", label: "Minimal", hint: "Flat colour, no blur or motion" },
  ];
  const FONT_LABELS: Record<FontKey, string> = { fontText: "Interface font", fontDisplay: "Heading font", fontLyrics: "Lyrics font" };

  let fonts = $state<string[] | null>(null);
  let notice = $state<string | null>(null);
  const s = $derived(prefs.value);

  onMount(() => {
    installedFonts().then(
      (list) => (fonts = list),
      (e) => {
        fonts = [];
        notice = `${t("Couldn't list your fonts.")} ${describeError(e)}`;
      },
    );
  });

  const setLanguage = (code: string) => selectLocale(code as Locale).catch((e) => (notice = describeError(e)));
</script>

{#if s}
  <Group heading="Theme">
    <Row label="Theme" keywords="dark mode light oled black colour color scheme skin">
      {#snippet below()}<ThemePicker />{/snippet}
    </Row>
    <Row label="Accent colour" keywords="color highlight tint">
      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        {#each ACCENTS as accent (accent)}
          <button
            role="radio"
            aria-checked={s.accent === accent}
            aria-label={accent}
            class="swatch"
            data-swatch={accent}
            class:active={s.accent === accent}
            onclick={() => prefs.update({ accent })}
          ></button>
        {/each}
      </div>
    </Row>
    <Row label="Effects" keywords="blur grain glass animation performance gpu slow">
      <div class="segmented" role="radiogroup" aria-label="Effects">
        {#each EFFECTS as e (e.id)}
          <button role="radio" aria-checked={s.effects === e.id} class:active={s.effects === e.id} title={t(e.hint)} onclick={() => prefs.update({ effects: e.id })}>
            {t(e.label)}
          </button>
        {/each}
      </div>
    </Row>
    <Toggle
      checked={s.gameMode}
      label="Game mode"
      description="Minimal effects and no motion while on."
      keywords="performance fps gaming visualizer"
      onchange={(v) => prefs.update({ gameMode: v })}
    />
  </Group>

  <Group heading="Text">
    <Row as="label" label="Language" keywords="locale translation idioma sprache langue lingua">
      <select value={activeLocale()} onchange={(e) => setLanguage(e.currentTarget.value)}>
        {#each Object.entries(languages) as [code, name] (code)}<option value={code}>{name}</option>{/each}
      </select>
    </Row>
    {#each FONT_ROLES as role (role.key)}
      <FontPicker
        label={t(FONT_LABELS[role.key])}
        value={s[role.key]}
        {fonts}
        fallback={role.fallback}
        onpick={(family) => prefs.update({ [role.key]: family } as Partial<Settings>)}
      />
    {/each}
    {#if notice}<p class="note warn" role="status">{notice}</p>{/if}
  </Group>

  <Group heading="Now playing">
    <CinemaSettings />
    <Toggle
      checked={s.sourceBadges}
      label="Show where songs come from"
      description="A tag under the playing song's title."
      keywords="source badge tag spotify youtube local radio server"
      onchange={(v) => prefs.update({ sourceBadges: v })}
    />
  </Group>
{/if}

<style>
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: 4px;
  }

  .swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--r-pill);
    background: var(--swatch);
    transition:
      transform var(--dur-med) var(--ease-spring),
      box-shadow var(--dur-fast);
  }

  .swatch.active {
    box-shadow:
      0 0 0 2px var(--stage),
      0 0 0 4px var(--swatch);
  }
</style>
