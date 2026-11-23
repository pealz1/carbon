/* [data-copy="text"] or [data-copy-from="#id"] buttons copy to the clipboard and confirm. */
import { toast } from "./toast.js?v=1";

const DONE_MS = 1600;

async function copyFrom(button) {
  const from = button.dataset.copyFrom && document.querySelector(button.dataset.copyFrom);
  const text = from ? from.textContent.trim() : button.dataset.copy;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add("is-done");
    toast(button.dataset.copyToast || "Copied to the clipboard", { tone: "ok", timeout: 2200 });
    setTimeout(() => button.classList.remove("is-done"), DONE_MS);
  } catch (err) {
    console.warn("Copy failed:", err);
    toast("Couldn’t copy. Select the text and copy it yourself.", { tone: "err" });
  }
}

export function initCopy() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-copy], [data-copy-from]");
    if (button) copyFrom(button);
  });
}
