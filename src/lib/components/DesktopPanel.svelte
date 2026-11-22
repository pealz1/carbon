<script lang="ts">
  // Settings → Desktop: startup, the window and tray, the mini player, notifications and global shortcuts.
  import { disable as autostartOff, enable as autostartOn, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount } from "svelte";
  import HotkeyEditor from "$lib/components/HotkeyEditor.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { DEFAULT_BINDINGS, sameShortcut } from "$lib/hotkeys";
  import { t } from "$lib/i18n/locale.svelte";
  import { hotkeysStatus, type Hotkeys, type HotkeyStatus, type StartupPage } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";

  const PAGES: { id: StartupPage; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "library", label: "Library" },
    { id: "liked", label: "Liked Songs" },
    { id: "search", label: "Search" },
    { id: "last", label: "Where I left off" },
  ];

  let status = $state<HotkeyStatus[]>([]);
  let startup = $state(false);
  let startupError = $state<string | null>(null);
  let shortcutsError = $state<string | null>(null);
  const s = $derived(prefs.value);
  const isDefault = $derived(!!s && (Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]).every((k) => s.hotkeys[k] === DEFAULT_BINDINGS[k] || sameShortcut(s.hotkeys[k], DEFAULT_BINDINGS[k])));

  async function refresh() {
    try {
      status = await hotkeysStatus();
      shortcutsError = null;
    } catch (e) {
      shortcutsError = `${t("Couldn't check the shortcuts.")} ${describeError(e)}`;
    }
  }

  onMount(() => {
    void refresh();
    autostartEnabled().then(
      (on) => (startup = on),
      (e) => (startupError = describeError(e)),
    );
  });

  async function toggleStartup(on: boolean) {
    try {
      await (on ? autostartOn() : autostartOff());
      startup = on;
      startupError = null;
    } catch (e) {
      startupError = `${t("Couldn't change startup.")} ${describeError(e)}`;
    }
  }

  async function save(hotkeys: Hotkeys) {
    await prefs.update({ hotkeys });
    await refresh();
  }
</script>

{#if s}
  <Group heading="Startup">
    <Toggle
      checked={startup}
      label="Open at startup"
      description="Starts in the tray when you sign in."
      message={startupError}
      warn
      keywords="boot login autostart launch windows"
      onchange={toggleStartup}
    />
    <Row as="label" label="Startup page" keywords="launch landing home first screen">
      <select value={s.startupPage} onchange={(e) => prefs.update({ startupPage: e.currentTarget.value as StartupPage })}>
        {#each PAGES as p (p.id)}<option value={p.id}>{t(p.label)}</option>{/each}
      </select>
    </Row>
  </Group>

  <Group heading="Window">
    <Toggle
      checked={s.closeToTray}
      label="Keep playing when closed"
      description="Closing keeps Carbon in the tray."
      keywords="tray background close minimise minimize"
      onchange={(v) => prefs.update({ closeToTray: v })}
    />
    <Toggle
      checked={s.confirmClose}
      disabled={s.closeToTray}
      label="Ask before quitting while music plays"
      description={s.closeToTray ? "Unused while Carbon closes to the tray." : undefined}
      keywords="confirm quit exit prompt"
      onchange={(v) => prefs.update({ confirmClose: v })}
    />
  </Group>

  <Group heading="Mini player">
    <Toggle checked={s.miniOnMinimize} label="Open mini player on minimize" keywords="pip compact small" onchange={(v) => prefs.update({ miniOnMinimize: v })} />
    <Toggle checked={s.miniPinned} label="Keep mini player on top" keywords="always on top pin" onchange={(v) => prefs.update({ miniPinned: v })} />
    <Toggle
      checked={s.miniClickThrough}
      label="Click through the mini player"
      description="Turn off here to use its buttons again."
      keywords="overlay ignore mouse"
      onchange={(v) => prefs.update({ miniClickThrough: v })}
    />
  </Group>

  <Group heading="Notifications">
    <Toggle
      checked={s.trackNotifications}
      label="Song notifications"
      description="When the song changes in another app."
      keywords="toast windows now playing alert"
      onchange={(v) => prefs.update({ trackNotifications: v })}
    />
  </Group>

  <Group heading="Global shortcuts">
    <Toggle
      checked={s.hotkeys.enabled}
      label="Global shortcuts"
      description="Ctrl+Alt can block AltGr characters."
      keywords="hotkeys keyboard media keys bindings"
      onchange={(enabled) => save({ ...s.hotkeys, enabled })}
    />
    <HotkeyEditor hotkeys={s.hotkeys} {status} onchange={save} />
    <Row label="Reset shortcuts" message={shortcutsError} warn keywords="default restore hotkeys">
      <button class="pill" onclick={() => save({ ...s.hotkeys, ...DEFAULT_BINDINGS })} disabled={isDefault}>Reset</button>
    </Row>
  </Group>
{/if}
