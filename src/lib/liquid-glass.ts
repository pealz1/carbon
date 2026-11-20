// Liquid glass: what's behind a pill-shaped panel bends at its rim, as through a thick lens, and stays
// true in the middle. The bend is a displacement map (red = x, green = y, 128 = none) that an SVG
// filter applies to the backdrop. Only Chromium (WebView2 on Windows) can filter a backdrop with SVG.

/** Pixel offsets of 0–1 bend strength, pointing inward from the pill's edge, as an RGBA map. */
export function pillMap(width: number, height: number, bezel: number): Uint8ClampedArray<ArrayBuffer> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const r = h / 2;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Distance inside a stadium (a rectangle with round ends) and the outward normal there.
      const cx = Math.min(Math.max(x + 0.5, r), w - r);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - r;
      const len = Math.hypot(dx, dy) || 1;
      const depth = r - len;
      const t = depth < bezel ? 1 - Math.max(0, depth) / bezel : 0;
      // Strongest at the very rim, easing to nothing a bezel's width in (a convex lens profile).
      const bend = t * t;
      const i = (y * w + x) * 4;
      out[i] = 128 - (dx / len) * bend * 127;
      out[i + 1] = 128 - (dy / len) * bend * 127;
      out[i + 2] = 128;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** The map as a PNG data URL, drawn at half size (the filter stretches it; the bend is smooth). */
export function pillMapUrl(width: number, height: number, bezel: number): string | null {
  const w = Math.max(1, Math.round(width / 2));
  const h = Math.max(1, Math.round(height / 2));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(pillMap(w, h, bezel / 2), w, h), 0, 0);
  return canvas.toDataURL("image/png");
}

/** WebView2 and other Chromium engines; WKWebView and WebKitGTK can't filter a backdrop with SVG. */
export const canBendBackdrop = (userAgent: string): boolean => /\bChrome\/\d+/.test(userAgent);
