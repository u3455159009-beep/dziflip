// Prints score distributions for positive (same scene, altered) and negative (different scene) pairs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { decodeJpeg } from '../src/vision/decode';
import { compareFeatures, extractFeatures, type FeatureVector } from '../src/vision/features';

const dir = join(__dirname, '../src/vision/__fixtures__');
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg'));
const feats = new Map<string, FeatureVector>();
for (const f of files) feats.set(f.replace('.jpg', ''), extractFeatures(decodeJpeg(new Uint8Array(readFileSync(join(dir, f))))));

const pos: [string, number][] = [];
const neg: number[] = [];
const negNamed: [string, number][] = [];
const bases = [...new Set([...feats.keys()].map((k) => k.split('__')[0]))];
for (const b of bases) {
  const ref = feats.get(`${b}__ref`)!;
  for (const [k, f] of feats) {
    if (k === `${b}__ref`) continue;
    const s = compareFeatures(f, ref).score;
    if (k.startsWith(`${b}__`)) pos.push([k, s]);
    else {
      neg.push(s);
      negNamed.push([`${k} vs ${b}`, s]);
    }
  }
}
pos.sort((a, b) => a[1] - b[1]);
negNamed.sort((a, b) => b[1] - a[1]);
const pct = (arr: number[], p: number) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
console.log('POS worst 10:', pos.slice(0, 10).map(([k, s]) => `${k}=${s.toFixed(3)}`).join('  '));
console.log('POS min/p10/median', pos[0][1].toFixed(3), pct(pos.map((p) => p[1]), 0.1).toFixed(3), pct(pos.map((p) => p[1]), 0.5).toFixed(3));
console.log('NEG worst 10:', negNamed.slice(0, 10).map(([k, s]) => `${k}=${s.toFixed(3)}`).join('  '));
console.log('NEG max/p99/p95/median', negNamed[0][1].toFixed(3), pct(neg, 0.99).toFixed(3), pct(neg, 0.95).toFixed(3), pct(neg, 0.5).toFixed(3));
for (const t of [0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
  const tpr = pos.filter((p) => p[1] >= t).length / pos.length;
  const fpr = neg.filter((s) => s >= t).length / neg.length;
  console.log(`t=${t}: accept same=${(tpr * 100).toFixed(1)}%  accept different=${(fpr * 100).toFixed(2)}%`);
}
