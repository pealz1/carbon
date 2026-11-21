import { engine, type Spectrum } from "./api";

/** Well inside the engine's five-second lease, so a listener never lapses. */
const RENEW_MS = 2000;

/** Calls `onBands` with the engine's spectrum (~30 a second) until the returned stop is called. */
export function followSpectrum(onBands: (bands: Spectrum) => void): () => void {
  const ask = (on: boolean) => engine.spectrum(on).catch((e) => console.warn("[spectrum] couldn't reach the engine", e));
  void ask(true);
  const renewing = setInterval(() => void ask(true), RENEW_MS);
  const listening = engine.onSpectrum(onBands);
  return () => {
    clearInterval(renewing);
    void ask(false);
    void listening.then((stop) => stop());
  };
}
