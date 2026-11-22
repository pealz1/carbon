<script lang="ts">
  import { onDestroy } from "svelte";
  import { comboFrom, comboKeys, HOTKEY_ACTIONS, sameShortcut } from "$lib/hotkeys";
  import { t } from "$lib/i18n/locale.svelte";
  import { hotkeysSuspend, type HotkeyAction, type Hotkeys, type HotkeyStatus } from "$lib/native";
  import { isMac } from "$lib/platform";
  import Row from "$lib/settings/Row.svelte";

  // The global shortcut bindings, one settings row each: click one, press the new keys. Esc
  // cancels, Backspace clears.
  let {
    hotkeys,
    status,
    onchange,
  }: { hotkeys: Hotkeys; status: HotkeyStatus[]; onchange: (next: Hotkeys) => Promise<unknown> } = $props();

  let recording = $state<HotkeyAction | null>(null);
  let conflict = $state<{ action: HotkeyAction; with: string } | null>(null);
  const failed = $derived(new Map(status.filter((s) => s.error).map((s) => [s.action, s.error])));
  const howTo = $derived(`${t("Hold")} ${t(isMac ? "Control, Option or Command" : "Ctrl, Alt or Win")} ${t("with a key. Esc cancels, Backspace clears.")}`);

  function setRecording(action: HotkeyAction | null) {
    if (recording === action) return;
    const wasRecording = recording !== null;
    recording = action;
    conflict = null;
    // Carbon's own shortcuts would fire instead of reaching the recorder; they come back after.
    if (wasRecording !== (action !== null)) hotkeysSuspend(action !== null).catch((e) => console.error("[hotkeys]", e));
  }

  onDestroy(() => recording && void hotkeysSuspend(false).catch((e) => console.error("[hotkeys]", e)));

  async function bind(action: HotkeyAction, combo: string) {
    const other = HOTKEY_ACTIONS.find((a) => a.action !== action && sameShortcut(hotkeys[a.action], combo));
    if (other) {
      conflict = { action, with: other.label };
      return;
    }
    setRecording(null);
    await onchange({ ...hotkeys, [action]: combo });
  }

  function onkeydown(event: KeyboardEvent, action: HotkeyAction) {
    if (recording !== action) return;
    event.preventDefault();
    event.stopPropagation(); // the window's own shortcuts mustn't see the keys being recorded
    if (event.key === "Escape") return setRecording(null);
    if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !event.altKey && !event.metaKey) return void bind(action, "");
    if (event.key === "Tab") return setRecording(null);
    const combo = comboFrom(event);
    if (combo) void bind(action, combo);
  }
</script>

{#each HOTKEY_ACTIONS as { action, label } (action)}
  {@const keys = comboKeys(hotkeys[action])}
  {@const problem = conflict?.action === action ? `${t("Already used for")} ${t(conflict.with)}. ${t("Press another, or Esc.")}` : hotkeys.enabled ? failed.get(action) : null}
  <Row label={t(label)} disabled={!hotkeys.enabled} message={problem ? problem : recording === action ? howTo : undefined} warn={!!problem} keywords="shortcut hotkey key binding">
    <button
      class="keys"
      class:recording={recording === action}
      aria-label="{t(label)}: {keys.length ? keys.join(' + ') : t('Not set')}"
      onclick={() => setRecording(recording === action ? null : action)}
      onkeydown={(e) => onkeydown(e, action)}
      onblur={() => recording === action && setRecording(null)}
    >
      {#if recording === action}
        Press a shortcut…
      {:else if keys.length}
        {#each keys as key, i (i)}<kbd>{key}</kbd>{/each}
      {:else}
        Not set
      {/if}
    </button>
  </Row>
{/each}

<style>
  .keys {
    min-width: 132px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-1);
    padding: 0 var(--sp-2);
    border-radius: var(--r-md);
    color: var(--text-muted);
    font-size: var(--fs-small);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      box-shadow var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .keys:hover {
    background: var(--glass-hover);
    color: var(--text);
  }

  .keys.recording {
    background: var(--glass-active);
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  kbd {
    min-width: 24px;
    padding: 2px var(--sp-2);
    border-radius: var(--r-sm);
    background: var(--glass-active);
    box-shadow:
      inset 0 -1px 0 rgb(0 0 0 / 0.35),
      inset 0 1px 0 var(--glass-edge-top);
    color: var(--text);
    font-family: inherit;
    font-size: var(--fs-caption);
    font-weight: 650;
    text-align: center;
  }
</style>
