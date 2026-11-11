// One context menu at a time, opened by right-click, the "…" button or the keyboard menu key.
import type { IconName } from "$lib/components/Icon.svelte";

export interface MenuItem {
  label: string;
  icon?: IconName;
  action?: () => unknown;
  /** A submenu. */
  items?: MenuEntry[];
  danger?: boolean;
  disabled?: boolean;
  /** Indent level, for folder trees inside a submenu. */
  depth?: number;
}

export type MenuEntry = MenuItem | "separator";

export interface OpenMenu {
  x: number;
  y: number;
  items: MenuEntry[];
  /** Where focus goes back to when the menu closes. */
  returnTo: HTMLElement | null;
}

class Menu {
  current = $state<OpenMenu | null>(null);

  /** Right-click opens at the pointer; a button or key opens under the element that has focus. */
  open(event: MouseEvent | KeyboardEvent, items: MenuEntry[]): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const fromPointer = event instanceof MouseEvent && event.type === "contextmenu" && (event.clientX || event.clientY);
    const rect = target?.getBoundingClientRect();
    const x = fromPointer ? event.clientX : (rect?.left ?? 0);
    const y = fromPointer ? event.clientY : (rect?.bottom ?? 0);
    this.current = { x, y, items, returnTo: (document.activeElement as HTMLElement | null) ?? target };
  }

  /** Opens at a point, for press-and-hold (the press event is long gone by then). */
  openAt(x: number, y: number, items: MenuEntry[], returnTo: HTMLElement | null = null): void {
    this.current = { x, y, items, returnTo: returnTo ?? (document.activeElement as HTMLElement | null) };
  }

  close(restoreFocus = true): void {
    const returnTo = this.current?.returnTo;
    this.current = null;
    if (restoreFocus) returnTo?.focus?.();
  }
}

export const menu = new Menu();
