<script lang="ts">
  import { onDestroy } from "svelte";
  import { comboFrom, comboKeys, HOTKEY_ACTIONS, sameShortcut } from "$lib/hotkeys";
  import { hotkeysSuspend, type HotkeyAction, type Hotkeys, type HotkeyStatus } from "$lib/native";

  // The global shortcut bindings: click one, press the new keys. Esc cancels, Backspace clears.
  let {
    hotkeys,
    status,
    onchange,
  }: { hotkeys: Hotkeys; status: HotkeyStatus[]; onchange: (next: Hotkeys) => Promise<unknown> } = $props();

  let recording = $state<HotkeyAction | null>(null);
  let conflict = $state<{ action: HotkeyAction; with: string } | null>(null);
  const failed = $derived(new Map(status.filter((s) => s.error).map((s) => [s.action, s.error])));

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

<ul class="bindings" class:off={!hotkeys.enabled}>
  {#each HOTKEY_ACTIONS as { action, label } (action)}
    {@const keys = comboKeys(hotkeys[action])}
    {@const problem = conflict?.action === action ? `Already used for ${conflict.with}.` : hotkeys.enabled ? failed.get(action) : null}
    <li>
      <span class="label" id="hotkey-{action}">{label}</span>
      <button
        class="keys"
        class:recording={recording === action}
        aria-labelledby="hotkey-{action} hotkey-{action}-value"
        aria-describedby={problem ? `hotkey-${action}-problem` : undefined}
        onclick={() => setRecording(recording === action ? null : action)}
        onkeydown={(e) => onkeydown(e, action)}
        onblur={() => recording === action && setRecording(null)}
      >
        <span id="hotkey-{action}-value">
          {#if recording === action}
            Press a shortcut…
          {:else if keys.length}
            {#each keys as key, i (i)}<kbd>{key}</kbd>{/each}
          {:else}
            Not set
          {/if}
        </span>
      </button>
      {#if recording === action}
        <p class="hint">Hold Ctrl, Alt or Win with a key. Esc cancels, Backspace clears.</p>
      {:else if problem}
        <p class="problem" id="hotkey-{action}-problem" role="status">{problem}</p>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .bindings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .bindings.off {
    opacity: 0.55;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-3);
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--glass-edge);
  }

  li:last-child {
    border-bottom: 0;
  }

  .label {
    font-size: var(--fs-body);
  }

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
      box-shadow var(--dur-fast);
  }

  .keys > span {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
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

  .hint,
  .problem {
    grid-column: 1 / -1;
    margin: 0;
    font-size: var(--fs-caption);
  }

  .hint {
    color: var(--text-faint);
  }

  .problem {
    color: var(--warning);
  }
</style>
