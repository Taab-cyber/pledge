// Image processing with sharp: watermarked previews for clients, small thumbnails for the AI check.
import sharp from "sharp";

const WATERMARK = "PLEDGE PREVIEW · NOT PAID YET";

function watermarkSvg(width: number, height: number): Buffer {
  const step = 260;
  const rows: string[] = [];
  // Tile the text diagonally across the whole image so it can't be cropped out easily.
  for (let y = -height; y < height * 2; y += step / 2) {
    for (let x = -width; x < width * 2; x += step * 1.6) {
      rows.push(
        `<text x="${x}" y="${y}" transform="rotate(-30 ${x} ${y})" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="rgba(16,24,40,0.22)" stroke="rgba(255,255,255,0.35)" stroke-width="1">${WATERMARK}</text>`,
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rows.join("")}</svg>`,
  );
}

function load(bytes: Uint8Array, mime: string) {
  // SVGs are rasterised at higher density so small vector logos stay crisp.
  return sharp(Buffer.from(bytes), mime === "image/svg+xml" ? { density: 192 } : {}).rotate();
}

/** Watermarked JPEG preview, longest side ≤ 1200 px. */
export async function makePreview(bytes: Uint8Array, mime: string): Promise<Buffer> {
  const base = await load(bytes, mime)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toBuffer({ resolveWithObject: true });
  return sharp(base.data)
    .composite([{ input: watermarkSvg(base.info.width, base.info.height), top: 0, left: 0 }])
    .jpeg({ quality: 72 })
    .toBuffer();
}

/** Small unwatermarked JPEG for the AI check only (never shown to the client). */
export async function makeThumbnail(bytes: Uint8Array, mime: string): Promise<Buffer> {
  return load(bytes, mime)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 70 })
    .toBuffer();
}
