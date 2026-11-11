// Detect file types from their first bytes ("magic bytes"), never from the name or browser-sent type.

export type SniffedType =
  | { mime: "image/png"; ext: "png" }
  | { mime: "image/jpeg"; ext: "jpg" }
  | { mime: "image/webp"; ext: "webp" }
  | { mime: "application/pdf"; ext: "pdf" };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export const SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isScreenshotType(
  t: SniffedType | null,
): t is Extract<SniffedType, { mime: `image/${string}` }> {
  return !!t && SCREENSHOT_TYPES.has(t.mime);
}
