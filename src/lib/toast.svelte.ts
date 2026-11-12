// Short, plain-language notices ("Added to Road trip", "Couldn't like that song") at the foot of the stage.
import { playSound } from "$lib/sfx";

const TOAST_MS = 4_000;
/** Long enough to reach an Undo. */
const ACTION_TOAST_MS = 6_000;

export interface ToastAction {
  label: string;
  run: () => unknown;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
  action?: ToastAction;
}

class Toasts {
  items = $state<Toast[]>([]);
  #next = 0;

  show(text: string, kind: Toast["kind"] = "info", action?: ToastAction): void {
    const id = ++this.#next;
    this.items = [...this.items.filter((t) => t.text !== text), { id, text, kind, ...(action && { action }) }];
    setTimeout(() => this.dismiss(id), action ? ACTION_TOAST_MS : TOAST_MS);
  }

  error(text: string): void {
    this.show(text, "error");
    playSound("error");
  }

  /** Runs a toast's action once and closes it. */
  act(toast: Toast): void {
    this.dismiss(toast.id);
    void toast.action?.run();
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
