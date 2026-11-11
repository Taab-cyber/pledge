// Detect file types from their first bytes ("magic bytes"), never from the name or browser-sent type.

export type SniffedType =
  | { mime: "image/png"; ext: "png" }
  | { mime: "image/jpeg"; ext: "jpg" }
  | { mime: "image/webp"; ext: "webp" }
  | { mime: "image/svg+xml"; ext: "svg" }
  | { mime: "application/pdf"; ext: "pdf" }
  | { mime: "application/zip"; ext: "zip" };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/** SVG is text: accept only a document whose root element is <svg> (after optional BOM, XML decl, comments). */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 4096))
    .replace(/^﻿/, "")
    .trimStart();
  const withoutProlog = head
    .replace(/^<\?xml[^>]*\?>\s*/i, "")
    .replace(/^(<!--[\s\S]*?-->\s*)+/, "")
    .replace(/^<!DOCTYPE svg[^>]*>\s*/i, "");
  return /^<svg[\s>]/i.test(withoutProlog);
}

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
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  if (looksLikeSvg(bytes)) return { mime: "image/svg+xml", ext: "svg" };
  return null;
}

export const SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isScreenshotType(
  t: SniffedType | null,
): t is Extract<SniffedType, { ext: "png" | "jpg" | "webp" }> {
  return !!t && SCREENSHOT_TYPES.has(t.mime);
}

/** Types we can render to a watermarked preview image (raster + SVG). */
export function isPreviewable(t: SniffedType): boolean {
  return t.mime.startsWith("image/");
}

/** Safe storage file name: keeps letters, digits, dot, dash, underscore; max 80 chars. */
export function safeFileName(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "") // drop any folder part
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") // no hidden files, no dangling separators
    .slice(0, 60);
  return `${base || "file"}.${ext}`;
}
