// What a slide can read from the story that is showing it.
import { createContext } from "svelte";

export interface StoryClock {
  /** Milliseconds the slide has been showing. It stands still while the story is paused. */
  readonly elapsed: number;
  /** Motion is switched off: Effects on Minimal, Motion on None, or the system's own setting. */
  readonly calm: boolean;
}

export const [useStory, provideStory] = createContext<StoryClock>();
