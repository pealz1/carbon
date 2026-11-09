// Playlist covers: Spotify wants base64 JPEG text of at most 256 KB, so images are cropped
// square, scaled down on a canvas and re-encoded at falling quality until they fit.
export const COVER_MAX_BASE64 = 256 * 1024;
export const COVER_SIZE = 640;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

/** The base64 payload of a data URL (Spotify wants it without the "data:...;base64," prefix). */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf("base64,");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + "base64,".length);
}

/** Largest centred square inside a w × h image. */
export function cropSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

/** Plain-language problem with a chosen file, or null. */
export function fileProblem(file: { type: string; size: number }): string | null {
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(file.type)) return "Pick a JPEG, PNG or WebP image.";
  if (file.size > MAX_SOURCE_BYTES) return "That image is over 20 MB. Pick a smaller one.";
  return null;
}

/** Re-encodes at falling quality until the base64 fits under `max`. `encode` returns a data URL. */
export async function fitJpeg(encode: (quality: number) => string | Promise<string>, max = COVER_MAX_BASE64): Promise<string> {
  for (const quality of QUALITIES) {
    const base64 = stripDataUrl(await encode(quality));
    if (base64.length <= max) return base64;
  }
  throw new Error("That image is too detailed to fit Spotify's 256 KB cover limit. Try another one.");
}

/** Decodes, crops and compresses a picked image. Browser-only (canvas). */
export async function coverFromFile(file: File): Promise<string> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Carbon couldn't read that image.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = COVER_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Carbon couldn't prepare the image.");
  const { sx, sy, side } = cropSquare(bitmap.width, bitmap.height);
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
  bitmap.close();
  return fitJpeg((quality) => canvas.toDataURL("image/jpeg", quality));
}
