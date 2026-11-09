// Short, plain-language notices ("Added to Road trip", "Couldn't like that song") above the dock.
const TOAST_MS = 4_000;

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

class Toasts {
  items = $state<Toast[]>([]);
  #next = 0;

  show(text: string, kind: Toast["kind"] = "info"): void {
    const id = ++this.#next;
    this.items = [...this.items.filter((t) => t.text !== text), { id, text, kind }];
    setTimeout(() => this.dismiss(id), TOAST_MS);
  }

  error(text: string): void {
    this.show(text, "error");
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
