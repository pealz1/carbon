<script lang="ts">
  import { dialogs } from "$lib/dialogs.svelte";
  import { SHORTCUTS } from "$lib/shortcuts";
  import Modal from "./Modal.svelte";
</script>

<Modal title="Keyboard shortcuts" onclose={() => (dialogs.shortcuts = false)}>
  <dl>
    {#each SHORTCUTS as shortcut (shortcut.label)}
      <div class="row">
        <dt>{shortcut.label}</dt>
        <dd>
          {#each shortcut.keys as key (key)}<kbd>{key}</kbd>{/each}
        </dd>
      </div>
    {/each}
  </dl>
  <p class="hint">Right-click anything, or focus it and press the menu key, for more options.</p>
</Modal>

<style>
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--glass-edge);
  }

  .row:last-child {
    border-bottom: 0;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    display: flex;
    gap: var(--sp-1);
    margin: 0;
  }

  kbd {
    min-width: 26px;
    padding: 3px var(--sp-2);
    border-radius: var(--r-sm);
    background: var(--glass-active);
    box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.35), inset 0 1px 0 var(--glass-edge-top);
    font-family: inherit;
    font-size: var(--fs-small);
    font-weight: 650;
    text-align: center;
  }

  .hint {
    margin: var(--sp-4) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-small);
  }
</style>
