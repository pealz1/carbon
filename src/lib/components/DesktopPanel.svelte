<script lang="ts">
  // Settings → Desktop: song notifications and global shortcuts.
  import { onMount } from "svelte";
  import HotkeyEditor from "$lib/components/HotkeyEditor.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { describeError } from "$lib/errors";
  import { DEFAULT_BINDINGS, sameShortcut } from "$lib/hotkeys";
  import { hotkeysStatus, type Hotkeys, type HotkeyStatus } from "$lib/native";
  import { prefs } from "$lib/preferences.svelte";

  let status = $state<HotkeyStatus[]>([]);
  let notice = $state<string | null>(null);
  const s = $derived(prefs.value);
  const isDefault = $derived(!!s && (Object.keys(DEFAULT_BINDINGS) as (keyof typeof DEFAULT_BINDINGS)[]).every((k) => s.hotkeys[k] === DEFAULT_BINDINGS[k] || sameShortcut(s.hotkeys[k], DEFAULT_BINDINGS[k])));

  async function refresh() {
    try {
      status = await hotkeysStatus();
      notice = null;
    } catch (e) {
      notice = `Couldn't check the shortcuts. ${describeError(e)}`;
    }
  }

  onMount(() => void refresh());

  async function save(hotkeys: Hotkeys) {
    await prefs.update({ hotkeys });
    await refresh();
  }
</script>

{#if s}
  <section class="panel plate">
    <h2>Desktop</h2>
    <Toggle
      checked={s.trackNotifications}
      label="Song notifications"
      description="A Windows notification with the artwork when the song changes while you're in another app."
      onchange={(v) => prefs.update({ trackNotifications: v })}
    />
    <Toggle
      checked={s.hotkeys.enabled}
      label="Global shortcuts"
      description="Control Carbon from any app. On some keyboards Ctrl+Alt shortcuts can block a character typed with AltGr; change those that do."
      onchange={(enabled) => save({ ...s.hotkeys, enabled })}
    />
    <HotkeyEditor hotkeys={s.hotkeys} {status} onchange={save} />
    <div class="actions">
      <button class="pill" onclick={() => save({ ...s.hotkeys, ...DEFAULT_BINDINGS })} disabled={isDefault}>Reset shortcuts</button>
    </div>
    {#if notice}<p class="warn" role="status">{notice}</p>{/if}
  </section>
{/if}

<style>
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

  .actions {
    display: flex;
    gap: var(--sp-2);
  }

  .warn {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }
</style>
