import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeJpeg } from './decode';
import {
  THRESHOLDS,
  bestMatch,
  compareFeatures,
  extractFeatures,
  parseFeatures,
  qualityIssue,
  serializeFeatures,
  type FeatureVector,
} from './features';

const dir = join(__dirname, '__fixtures__');
const feats = new Map<string, FeatureVector>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.jpg'))) {
  feats.set(f.replace('.jpg', ''), extractFeatures(decodeJpeg(new Uint8Array(readFileSync(join(dir, f))))));
}
const bases = [...new Set([...feats.keys()].map((k) => k.split('__')[0]))];

function pairs() {
  const pos: number[] = [];
  const neg: number[] = [];
  for (const b of bases) {
    const ref = feats.get(`${b}__ref`)!;
    for (const [k, f] of feats) {
      if (k === `${b}__ref`) continue;
      (k.startsWith(`${b}__`) ? pos : neg).push(compareFeatures(f, ref).score);
    }
  }
  return { pos, neg };
}

describe('photo matcher on real photographs', () => {
  const { pos, neg } = pairs();

  it('has a meaningful fixture set', () => {
    expect(bases.length).toBeGreaterThanOrEqual(10);
    expect(pos.length).toBeGreaterThan(70);
    expect(neg.length).toBeGreaterThan(800);
  });

  it('identical image scores ~1', () => {
    const f = feats.get('astronaut__ref')!;
    expect(compareFeatures(f, f).score).toBeGreaterThan(0.99);
  });

  it.each(['easy', 'medium', 'hard'] as const)('never accepts an unrelated scene at %s strictness', (level) => {
    expect(neg.filter((s) => s >= THRESHOLDS[level]).length).toBe(0);
  });

  it('accepts ≥95 % of genuine retakes at medium strictness', () => {
    const rate = pos.filter((s) => s >= THRESHOLDS.medium).length / pos.length;
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });

  it('accepts a different viewpoint of the same object (stereo pair)', () => {
    const r = compareFeatures(feats.get('motorcycle_left__otherview')!, feats.get('motorcycle_left__ref')!);
    expect(r.score).toBeGreaterThanOrEqual(THRESHOLDS.hard);
  });

  it('is robust to lighting changes', () => {
    for (const b of ['astronaut', 'chelsea', 'coffee', 'rocket', 'grace_hopper']) {
      const ref = feats.get(`${b}__ref`)!;
      expect(compareFeatures(feats.get(`${b}__dark`)!, ref).score).toBeGreaterThan(THRESHOLDS.hard);
      expect(compareFeatures(feats.get(`${b}__bright`)!, ref).score).toBeGreaterThan(THRESHOLDS.hard);
    }
  });

  it('bestMatch takes the closest reference', () => {
    const cand = feats.get('coffee__shift')!;
    const r = bestMatch(cand, [feats.get('chelsea__ref')!, feats.get('coffee__ref')!]);
    expect(r!.score).toBeCloseTo(compareFeatures(cand, feats.get('coffee__ref')!).score, 6);
    expect(bestMatch(cand, [])).toBeNull();
  });
});

describe('quality gate', () => {
  const solid = (v: number) => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    return extractFeatures({ data, width: 64, height: 64 });
  };

  it('rejects a covered lens / black frame', () => expect(qualityIssue(solid(5))).toBe('tooDark'));
  it('rejects a blank wall', () => expect(qualityIssue(solid(128))).toBe('noDetail'));
  it('accepts real photos', () => {
    for (const b of bases) expect(qualityIssue(feats.get(`${b}__ref`)!)).toBeNull();
  });
});

describe('serialization', () => {
  it('round-trips and rejects other versions', () => {
    const f = feats.get('rocket__ref')!;
    expect(parseFeatures(serializeFeatures(f))).toEqual(f);
    expect(parseFeatures(JSON.stringify({ ...f, v: 1 }))).toBeNull();
    expect(parseFeatures('nope')).toBeNull();
  });
});
