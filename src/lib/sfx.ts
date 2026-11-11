// Runs interface sounds: one AudioContext, made on first use, behind the policy gate. The layout
// tells it what the player and Settings say (setSoundGate), so this module imports neither.
import { peakGain, RECIPES, schedule, soundAllowed, type SoundGate, type UiSound } from "$lib/ui-sound";

const SILENT: SoundGate = { enabled: false, volume: 0, paused: true, trackUri: null };

export function createSfx(gate: () => SoundGate, makeContext: () => AudioContext = () => new AudioContext()) {
  let ctx: AudioContext | null = null;
  return {
    /** Returns whether the sound played. */
    play(name: UiSound): boolean {
      const state = gate();
      if (!soundAllowed(state)) return false;
      try {
        ctx ??= makeContext();
        if (ctx.state === "suspended") void ctx.resume();
        schedule(ctx, RECIPES[name], peakGain(state.volume));
        return true;
      } catch (e) {
        console.warn("[sfx] couldn't play an interface sound", e);
        return false;
      }
    },
  };
}

let readGate: () => SoundGate = () => SILENT;
export const setSoundGate = (read: () => SoundGate): void => void (readGate = read);
const sfx = createSfx(() => readGate());
export const playSound = (name: UiSound): boolean => sfx.play(name);

const CLICKABLE = "button, a[href], [role='menuitem'], [role='tab'], [role='radio'], [role='option']";
const CHOOSING = new Set(["menuitem", "tab", "radio", "option"]);

/** Which sound a click on this element makes: choices select, links whoosh, everything else taps. */
export function soundFor(target: EventTarget | null): UiSound | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(CLICKABLE);
  if (!el || el.matches(":disabled, [aria-disabled='true']") || el.closest("[data-silent]")) return null;
  if (CHOOSING.has(el.getAttribute("role") ?? "") || el.hasAttribute("aria-pressed")) return "select";
  return el instanceof HTMLAnchorElement ? "whoosh" : "tap";
}

/** One listener for the whole app: clicks tap, switches toggle. Returns the cleanup. */
export function installSoundFeedback(root: Document): () => void {
  const onClick = (event: MouseEvent) => {
    const sound = soundFor(event.target);
    if (sound) playSound(sound);
  };
  const onChange = (event: Event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === "checkbox") playSound(input.checked ? "toggle-on" : "toggle-off");
  };
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
  };
}
