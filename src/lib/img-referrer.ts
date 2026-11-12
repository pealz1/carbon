// YouTube's image host refuses images requested with Carbon's address as the referrer. Rather than tag
// every <img>, a failed googleusercontent image is retried once without a referrer.
const YOUTUBE_IMAGES = /(^|\.)googleusercontent\.com$/;

/** Retries `target` without a referrer when it's a failed YouTube image; true when it did. */
export function retryWithoutReferrer(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLImageElement) || target.referrerPolicy === "no-referrer") return false;
  let host: string;
  try {
    host = new URL(target.currentSrc || target.src).hostname;
  } catch {
    return false;
  }
  if (!YOUTUBE_IMAGES.test(host)) return false;
  target.referrerPolicy = "no-referrer";
  target.src = target.src; // reassigning restarts the request with the new policy
  return true;
}

/** Image errors don't bubble, so this listens in the capture phase. */
export const watchImageErrors = (doc: Document): void =>
  doc.addEventListener("error", (event) => void retryWithoutReferrer(event.target), true);
