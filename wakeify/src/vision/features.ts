/**
 * Offline scene/object matcher.
 *
 * We compare the morning photo with the user's reference photo(s) of the same
 * object/place (their sink, their mirror, the view from their window). This is
 * *instance* matching, not semantic classification, so classic hand-crafted
 * descriptors work well, run in pure JS in a few ms, need no model download
 * and no network:
 *
 *  - colour histogram in HSV (hue × saturation + grey levels) – what colours are present
 *  - spatial colour layout (4×4 chromaticity grid)           – where the colours are
 *  - HOG-lite: gradient-orientation histograms on an 8×8 grid  – shapes / edges
 *  - luminance layout (8×8 block means, correlation)           – composition, exposure-invariant
 *  - dHash (64-bit perceptual hash)                            – overall composition
 *
 * All structural features are contrast-normalised, so moderate lighting
 * changes (morning vs. evening light, lamp on/off) are tolerated.
 */

export const FEATURE_VERSION = 2;
export const GRID = 64;
const CELLS = 8;
const BINS = 9;

export type RgbaImage = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };

export type FeatureVector = {
  v: number;
  colorHist: number[];
  colorLayout: number[];
  hog: number[];
  lumaLayout: number[];
  dhash: string;
  meanLuma: number; // 0..1
  stdLuma: number; // 0..1
  edgeDensity: number; // 0..1 share of pixels with a noticeable gradient
};

export type MatchParts = {
  colorHist: number;
  colorLayout: number;
  hog: number;
  lumaLayout: number;
  dhash: number;
};

export type MatchResult = { score: number; parts: MatchParts };

/** Area-average resample of an RGBA image into a GRID×GRID float RGB (0..1) grid. */
export function resample(img: RgbaImage, size = GRID): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(size * size * 3);
  const sx = width / size;
  const sy = height / size;
  for (let gy = 0; gy < size; gy++) {
    const y0 = Math.floor(gy * sy);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * sy));
    for (let gx = 0; gx < size; gx++) {
      const x0 = Math.floor(gx * sx);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < x1 && x < width; x++, i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
      }
      const o = (gy * size + gx) * 3;
      out[o] = r / (255 * n);
      out[o + 1] = g / (255 * n);
      out[o + 2] = b / (255 * n);
    }
  }
  return out;
}

const HUE_BINS = 12;
const SAT_BINS = 3;
const GREY_BINS = 4;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function l1(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map((x) => x / s) : v;
}

function l2(v: number[]): number[] {
  const s = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return s > 1e-9 ? v.map((x) => x / s) : v;
}

export function extractFeatures(img: RgbaImage): FeatureVector {
  const px = resample(img, GRID);
  const n = GRID * GRID;

  // --- luminance + colour histogram + layout -------------------------------
  const luma = new Float32Array(n);
  const hist = new Array(HUE_BINS * SAT_BINS + GREY_BINS).fill(0);
  const layout = new Array(4 * 4 * 2).fill(0);
  const layoutCount = new Array(16).fill(0);
  // Grey-world white balance for the colour features: a warm bedside lamp or
  // cold morning light shifts all channels, the scene's colours stay put.
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    mr += px[i * 3];
    mg += px[i * 3 + 1];
    mb += px[i * 3 + 2];
  }
  const grey = (mr + mg + mb) / 3;
  const wr = mr > 1e-6 ? grey / mr : 1;
  const wg = mg > 1e-6 ? grey / mg : 1;
  const wb = mb > 1e-6 ? grey / mb : 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const y = 0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2];
    luma[i] = y;
    sum += y;
    const r = Math.min(1, px[i * 3] * wr);
    const g = Math.min(1, px[i * 3 + 1] * wg);
    const b = Math.min(1, px[i * 3 + 2] * wb);
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < 0.18 || v < 0.12) {
      hist[HUE_BINS * SAT_BINS + Math.min(GREY_BINS - 1, Math.floor(v * GREY_BINS))] += 1;
    } else {
      const hb = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
      const sb = Math.min(SAT_BINS - 1, Math.floor(((s - 0.18) / 0.82) * SAT_BINS));
      hist[hb * SAT_BINS + sb] += 1;
    }
    const cell = Math.floor(Math.floor(i / GRID) / 16) * 4 + Math.floor((i % GRID) / 16);
    const tot = r + g + b + 1e-6;
    layout[cell * 2] += r / tot;
    layout[cell * 2 + 1] += g / tot;
    layoutCount[cell] += 1;
  }
  for (let c = 0; c < 16; c++) {
    layout[c * 2] /= layoutCount[c];
    layout[c * 2 + 1] /= layoutCount[c];
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (luma[i] - mean) ** 2;
  const std = Math.sqrt(varSum / n);

  // --- gradients: HOG-lite (CELLS×CELLS cells × BINS orientations) ----------
  // Normalise luminance first so exposure differences do not change magnitudes.
  const norm = new Float32Array(n);
  const k = std > 1e-4 ? 1 / std : 1;
  for (let i = 0; i < n; i++) norm[i] = (luma[i] - mean) * k;

  const hog = new Array(CELLS * CELLS * BINS).fill(0);
  const cellSize = GRID / CELLS;
  let edges = 0;
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const i = y * GRID + x;
      // Sobel
      const gx =
        norm[i - GRID + 1] + 2 * norm[i + 1] + norm[i + GRID + 1] -
        (norm[i - GRID - 1] + 2 * norm[i - 1] + norm[i + GRID - 1]);
      const gy =
        norm[i + GRID - 1] + 2 * norm[i + GRID] + norm[i + GRID + 1] -
        (norm[i - GRID - 1] + 2 * norm[i - GRID] + norm[i - GRID + 1]);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag < 1e-6) continue;
      if (mag > 0.8) edges++;
      let ang = Math.atan2(gy, gx); // -π..π
      if (ang < 0) ang += Math.PI; // unsigned orientation 0..π
      const pos = (ang / Math.PI) * BINS;
      const b0 = Math.floor(pos) % BINS;
      const b1 = (b0 + 1) % BINS;
      const w1 = pos - Math.floor(pos);
      const cell = Math.floor(y / cellSize) * CELLS + Math.floor(x / cellSize);
      hog[cell * BINS + b0] += mag * (1 - w1);
      hog[cell * BINS + b1] += mag * w1;
    }
  }
  const hogNorm: number[] = [];
  for (let c = 0; c < CELLS * CELLS; c++) {
    // L2-Hys style: normalise, clip, renormalise per cell
    const cellV = l2(hog.slice(c * BINS, (c + 1) * BINS)).map((v) => Math.min(v, 0.4));
    hogNorm.push(...l2(cellV));
  }

  // --- luminance layout: 8×8 block means (compared by correlation) ---------
  const lumaLayout = new Array(64).fill(0);
  for (let i = 0; i < n; i++) lumaLayout[Math.floor(Math.floor(i / GRID) / 8) * 8 + Math.floor((i % GRID) / 8)] += luma[i] / 64;

  // --- dHash 9×8 on luminance ---------------------------------------------
  const small = new Float32Array(9 * 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const y0 = Math.floor((y * GRID) / 8);
      const y1 = Math.floor(((y + 1) * GRID) / 8);
      const x0 = Math.floor((x * GRID) / 9);
      const x1 = Math.floor(((x + 1) * GRID) / 9);
      let s = 0;
      let c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++, c++) s += luma[yy * GRID + xx];
      small[y * 9 + x] = s / c;
    }
  }
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (small[y * 9 + x] > small[y * 9 + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }

  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    v: FEATURE_VERSION,
    colorHist: l1(hist).map(round),
    colorLayout: layout.map(round),
    hog: hogNorm.map(round),
    lumaLayout: lumaLayout.map(round),
    dhash: hex,
    meanLuma: round(mean),
    stdLuma: round(std),
    edgeDensity: round(edges / ((GRID - 2) * (GRID - 2))),
  };
}

// --- comparison --------------------------------------------------------------

function bhattacharyya(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.sqrt(Math.max(0, a[i]) * Math.max(0, b[i]));
  return Math.min(1, s);
}

/** Pearson correlation mapped to 0..1 (negative correlation → 0). */
function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 1e-12 && db > 1e-12 ? Math.max(0, num / Math.sqrt(da * db)) : 0;
}

function hamming64(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Rescales a raw similarity so that `floor` → 0 and 1 → 1 (unrelated images rarely go below floor). */
function stretch(v: number, floor: number): number {
  return Math.max(0, Math.min(1, (v - floor) / (1 - floor)));
}

const HOG_FLOOR = 0.1;
const LUMA_FLOOR = 0.1;

export const WEIGHTS: MatchParts = {
  colorHist: 0.2,
  colorLayout: 0.15,
  hog: 0.35,
  lumaLayout: 0.2,
  dhash: 0.1,
};

export function compareFeatures(a: FeatureVector, b: FeatureVector): MatchResult {
  const layoutDist = Math.sqrt(a.colorLayout.reduce((s, v, i) => s + (v - b.colorLayout[i]) ** 2, 0));
  const parts: MatchParts = {
    colorHist: stretch(bhattacharyya(a.colorHist, b.colorHist), 0.35),
    // chromaticity layout distance: 0 identical; ~0.5+ very different
    colorLayout: Math.max(0, 1 - layoutDist / 0.5),
    hog: stretch(correlation(a.hog, b.hog), HOG_FLOOR),
    lumaLayout: stretch(correlation(a.lumaLayout, b.lumaLayout), LUMA_FLOOR),
    dhash: stretch(1 - hamming64(a.dhash, b.dhash) / 64, 0.5),
  };
  const score =
    parts.colorHist * WEIGHTS.colorHist +
    parts.colorLayout * WEIGHTS.colorLayout +
    parts.hog * WEIGHTS.hog +
    parts.lumaLayout * WEIGHTS.lumaLayout +
    parts.dhash * WEIGHTS.dhash;
  return { score, parts };
}

/** Best match against any of the reference photos. */
export function bestMatch(candidate: FeatureVector, references: FeatureVector[]): MatchResult | null {
  let best: MatchResult | null = null;
  for (const ref of references) {
    const r = compareFeatures(candidate, ref);
    if (!best || r.score > best.score) best = r;
  }
  return best;
}

/**
 * Acceptance thresholds, calibrated on real photographs with simulated
 * "next morning" conditions (shifted framing, ±7° rotation, darker/brighter
 * exposure, warm lamp tint, blur + sensor noise, a second viewpoint) versus
 * unrelated scenes — see src/vision/vision.test.ts and scripts/calibrate-vision.ts.
 * At 'medium' ≈98 % of genuine retakes pass and no unrelated scene did.
 */
export const THRESHOLDS: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 0.45,
  medium: 0.5,
  hard: 0.58,
};

export type QualityIssue = 'tooDark' | 'tooBright' | 'noDetail';

/** Rejects photos that cannot be meaningfully compared (lens covered, black frame, blank wall). */
export function qualityIssue(f: FeatureVector): QualityIssue | null {
  if (f.meanLuma < 0.07) return 'tooDark';
  if (f.meanLuma > 0.97 && f.stdLuma < 0.03) return 'tooBright';
  if (f.stdLuma < 0.025 || f.edgeDensity < 0.004) return 'noDetail';
  return null;
}

export function serializeFeatures(f: FeatureVector): string {
  return JSON.stringify(f);
}

export function parseFeatures(s: string): FeatureVector | null {
  try {
    const f = JSON.parse(s) as FeatureVector;
    return f && f.v === FEATURE_VERSION ? f : null;
  } catch {
    return null;
  }
}
