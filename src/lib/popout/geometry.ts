// Window geometry the mini player remembers between uses, and whether it still fits a screen.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Screen {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/** How much of a window must be on some screen to put it back there, in physical pixels. */
const MIN_VISIBLE = 64;

export function fitsOnScreen(rect: Rect, screens: Screen[]): boolean {
  return screens.some(({ position, size }) => {
    const overlapX = Math.min(rect.x + rect.width, position.x + size.width) - Math.max(rect.x, position.x);
    const overlapY = Math.min(rect.y + rect.height, position.y + size.height) - Math.max(rect.y, position.y);
    return overlapX >= MIN_VISIBLE && overlapY >= MIN_VISIBLE;
  });
}

/** A saved rect, or null when the stored value isn't one. */
export function parseRect(raw: string | null): Rect | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<Rect> | null;
    const numbers = [value?.x, value?.y, value?.width, value?.height];
    if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    const rect = value as Rect;
    return rect.width > 0 && rect.height > 0 ? rect : null;
  } catch {
    return null;
  }
}
