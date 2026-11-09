<script lang="ts">
  let {
    checked,
    label,
    description,
    disabled = false,
    onchange,
  }: { checked: boolean; label: string; description?: string; disabled?: boolean; onchange: (value: boolean) => void } = $props();
</script>

<label class="toggle" class:disabled>
  <span class="text">
    <span class="label">{label}</span>
    {#if description}<span class="description">{description}</span>{/if}
  </span>
  <input type="checkbox" role="switch" {checked} {disabled} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</label>

<style>
  .toggle {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-3) 0;
    cursor: pointer;
  }

  .disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-weight: 600;
  }

  .description {
    font-size: var(--fs-small);
    color: var(--text-muted);
    max-width: 52ch;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .track {
    flex: none;
    width: 44px;
    height: 26px;
    border-radius: var(--r-pill);
    background: var(--glass-active);
    border: 1px solid var(--glass-edge);
    transition: background var(--dur-med) var(--ease-out);
  }

  .knob {
    display: block;
    width: 20px;
    height: 20px;
    margin: 2px;
    border-radius: var(--r-pill);
    background: var(--text);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
    transition: transform var(--dur-med) var(--ease-spring);
  }

  input:checked + .track {
    background: var(--accent);
  }

  input:checked + .track .knob {
    transform: translateX(18px);
    background: var(--accent-ink);
  }

  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
</style>
