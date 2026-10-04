import { decode } from 'jpeg-js';

import type { RgbaImage } from './features';

/** Decodes a (small, already downscaled) JPEG into RGBA pixels. Pure JS, works offline. */
export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  const img = decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
  return { data: img.data, width: img.width, height: img.height };
}
