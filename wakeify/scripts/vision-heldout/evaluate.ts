/**
 * Held-out evaluation of the photo matcher with the FROZEN thresholds from
 * src/vision/features.ts. Run after prepare.py:
 *   npx tsx scripts/vision-heldout/evaluate.ts <out_dir>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { decodeJpeg } from '../../src/vision/decode';
import { THRESHOLDS, compareFeatures, extractFeatures, qualityIssue, type FeatureVector } from '../../src/vision/features';

const dir = join(process.argv[2] ?? 'heldout-data', 'fx');
const F = new Map<string, FeatureVector>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.jpg'))) {
  F.set(f.slice(0, -4), extractFeatures(decodeJpeg(new Uint8Array(readFileSync(join(dir, f))))));
}
const ref = (n: string) => F.get(`${n}__ref`)!;
const names = [...new Set([...F.keys()].map((k) => k.split('__')[0]))].sort();

/** Photos of the same scene must never be counted as "different" pairs. */
function group(n: string): string {
  const m = /^(st_[a-z]+|sd_graf|sd_aero|sd_box|sd_Blender_Suzanne|sd_aloe|sd_(?:left|right)0\d)/.exec(n);
  if (!m) return n;
  return m[1].replace(/^sd_(left|right)0\d$/, 'sd_chessboard');
}

// Real viewpoint pairs (different camera position, real sensor).
const VIEW_PAIRS: [string, string][] = [
  ['st_a1', 'st_a2'], ['st_a2', 'st_a3'], ['st_b1', 'st_b2'], ['st_s1', 'st_s2'],
  ...[1, 2, 3, 4, 5].map((i) => [`st_boat${i}`, `st_boat${i + 1}`] as [string, string]),
  ...[1, 2, 3, 4, 5].map((i) => [`st_budapest${i}`, `st_budapest${i + 1}`] as [string, string]),
  ...[1, 2, 3].map((i) => [`st_newspaper${i}`, `st_newspaper${i + 1}`] as [string, string]),
  ['sd_graf1', 'sd_graf3'], ['sd_aero1', 'sd_aero3'], ['sd_Blender_Suzanne1', 'sd_Blender_Suzanne2'],
  ['sd_aloeL', 'sd_aloeR'], ['sd_left01', 'sd_right01'], ['sd_left02', 'sd_right02'],
];
const OBJECT_IN_CLUTTER: [string, string][] = [['sd_box', 'sd_box_in_scene']];

const usable = names.filter((n) => qualityIssue(ref(n)) == null);
const rejected = names.filter((n) => qualityIssue(ref(n)) != null);

const synthetic: number[] = [];
for (const n of usable) for (const v of ['shift', 'dark', 'bright', 'rot', 'noise', 'combo']) {
  synthetic.push(compareFeatures(F.get(`${n}__${v}`)!, ref(n)).score);
}
const view = VIEW_PAIRS.filter(([a, b]) => F.has(`${a}__ref`) && F.has(`${b}__ref`)).map(([a, b]) => ({
  pair: `${a}~${b}`,
  score: compareFeatures(ref(b), ref(a)).score,
}));
const negatives: number[] = [];
let worstNeg = { pair: '', score: 0 };
for (const a of usable) for (const b of usable) {
  if (a === b || group(a) === group(b)) continue;
  for (const v of ['ref', 'shift', 'dark', 'combo']) {
    const s = compareFeatures(F.get(`${a}__${v}`)!, ref(b)).score;
    negatives.push(s);
    if (s > worstNeg.score) worstNeg = { pair: `${a}__${v} vs ${b}`, score: s };
  }
}
const count = (arr: number[], t: number) => arr.filter((s) => s >= t).length;
const frac = (arr: number[], t: number) => `${count(arr, t)}/${arr.length} (${((count(arr, t) / arr.length) * 100).toFixed(1)} %)`;

console.log(`photos: ${names.length} (quality gate rejected as reference: ${rejected.join(', ') || 'none'})`);
console.log(`pairs: synthetic retakes=${synthetic.length}, real viewpoint pairs=${view.length}, different-scene pairs=${negatives.length}`);
for (const level of ['easy', 'medium', 'hard'] as const) {
  const t = THRESHOLDS[level];
  console.log(
    `${level.padEnd(6)} t=${t}: synthetic accepted ${frac(synthetic, t)} | real viewpoint accepted ${frac(view.map((v) => v.score), t)} | different scene accepted ${frac(negatives, t)}`,
  );
}
console.log('real viewpoint pairs:', view.map((v) => `${v.pair}=${v.score.toFixed(2)}`).join('  '));
console.log('object in clutter:', OBJECT_IN_CLUTTER.map(([a, b]) => `${a}~${b}=${compareFeatures(ref(b), ref(a)).score.toFixed(2)}`).join('  '));
console.log(`worst different-scene pair: ${worstNeg.pair} = ${worstNeg.score.toFixed(3)}`);
