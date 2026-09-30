import { nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/md-logo.jpeg');

// Rounded-square artwork inside the (landscape, grey-background) source JPEG.
const ARTWORK = { x: 429, y: 100, width: 550, height: 568, radius: 116 };
// macOS icons leave ~10% padding on each side of the artwork.
const ARTWORK_SCALE = 0.8;

// Crops the artwork into a square canvas and makes everything outside the rounded
// rectangle transparent, since JPEG has no alpha channel.
export function loadAppIcon() {
  const source = nativeImage.createFromPath(ICON_PATH);
  if (source.isEmpty()) return null;

  const size = Math.round(Math.max(ARTWORK.width, ARTWORK.height) / ARTWORK_SCALE);
  const centerX = ARTWORK.x + ARTWORK.width / 2;
  const centerY = ARTWORK.y + ARTWORK.height / 2;
  const cropped = source.crop({
    x: Math.round(centerX - size / 2),
    y: Math.round(centerY - size / 2),
    width: size,
    height: size,
  });

  const { width, height } = cropped.getSize();
  const bitmap = cropped.toBitmap();
  const halfWidth = ARTWORK.width / 2;
  const halfHeight = ARTWORK.height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const qx = Math.max(Math.abs(x + 0.5 - width / 2) - (halfWidth - ARTWORK.radius), 0);
      const qy = Math.max(Math.abs(y + 0.5 - height / 2) - (halfHeight - ARTWORK.radius), 0);
      const coverage = Math.min(Math.max(ARTWORK.radius + 0.5 - Math.hypot(qx, qy), 0), 1);
      if (coverage === 1) continue;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) bitmap[offset + channel] *= coverage;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}
