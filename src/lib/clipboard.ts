import { toasts } from "$lib/toast.svelte";

/** Copies text and confirms with `done`; says so when the clipboard refuses. */
export async function copyText(text: string, done = "Copied."): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(done);
    return true;
  } catch (e) {
    console.error("[clipboard] copy failed", e);
    toasts.error("Couldn't copy that.");
    return false;
  }
}
