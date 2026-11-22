<script lang="ts">
  import Row from "$lib/settings/Row.svelte";

  // A switch as a settings row. `description` is its tooltip; `message` stays visible, for the few
  // switches that need a word of warning.
  interface Props {
    checked: boolean;
    label: string;
    description?: string | null;
    message?: string | null;
    warn?: boolean;
    keywords?: string;
    disabled?: boolean;
    onchange: (value: boolean) => void;
  }

  let { checked, label, description, message, warn = false, keywords, disabled = false, onchange }: Props = $props();
</script>

<Row as="label" class="toggle" {label} {description} {message} {warn} {keywords} {disabled}>
  <input type="checkbox" role="switch" {checked} {disabled} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</Row>

<style>
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
    transition: transform var(--dur-spring) var(--ease-spring);
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
