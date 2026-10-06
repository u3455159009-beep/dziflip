import { describe, expect, it } from 'vitest';

import {
  challengeSummary,
  defaultPlan,
  generateWeeklyPlan,
  hash32,
  isoWeek,
  referencedTargets,
  resolveChallenge,
  weekIndex,
} from './rotation';
import type { Challenge, ChallengePlan } from './types';

process.env.TZ = 'Europe/Prague';

const c = (count: number): Challenge => ({ steps: [{ kind: 'math', count, difficulty: 'easy' }] });
const plan = (p: Partial<ChallengePlan>): ChallengePlan => ({ ...defaultPlan(), ...p });

describe('isoWeek / weekIndex', () => {
  it('matches ISO-8601 edge cases', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 }); // Thursday
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 }); // Friday
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
  });
  it('weekIndex changes on Monday and is stable within a week', () => {
    const sun = weekIndex(new Date(2026, 9, 4, 23));
    const mon = weekIndex(new Date(2026, 9, 5, 0, 1));
    const fri = weekIndex(new Date(2026, 9, 9, 7));
    expect(mon).toBe(sun + 1);
    expect(fri).toBe(mon);
  });
});

describe('resolveChallenge', () => {
  it('fixed', () => {
    expect(resolveChallenge(plan({ challenge: c(4) }), 'a', new Date())).toEqual(c(4));
  });
  it('weekday plan with fallback', () => {
    const p = plan({ mode: 'weekday', challenge: c(9), weekdayPlan: { 1: c(1), 3: c(3) } });
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 5, 7))).toEqual(c(1)); // Monday
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 7, 7))).toEqual(c(3)); // Wednesday
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 6, 7))).toEqual(c(9)); // Tuesday → fallback
  });
  it('weekly rotation: same all week, next one next week', () => {
    const p = plan({ mode: 'weekly', pool: [c(1), c(2), c(3)] });
    const mon = resolveChallenge(p, 'a', new Date(2026, 9, 5, 7));
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 11, 7))).toEqual(mon);
    const next = resolveChallenge(p, 'a', new Date(2026, 9, 12, 7));
    expect(next).not.toEqual(mon);
    // full cycle returns after pool.length weeks
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 26, 7))).toEqual(mon);
  });
  it('daily rotation cycles through the pool', () => {
    const p = plan({ mode: 'daily', pool: [c(1), c(2)] });
    const d1 = resolveChallenge(p, 'a', new Date(2026, 9, 5, 7));
    const d2 = resolveChallenge(p, 'a', new Date(2026, 9, 6, 7));
    expect(d1).not.toEqual(d2);
    expect(resolveChallenge(p, 'a', new Date(2026, 9, 7, 7))).toEqual(d1);
  });
  it('random is deterministic per occurrence and covers the pool', () => {
    const p = plan({ mode: 'random', pool: [c(1), c(2), c(3)] });
    const t = new Date(2026, 9, 5, 7);
    expect(resolveChallenge(p, 'a', t)).toEqual(resolveChallenge(p, 'a', t));
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const ch = resolveChallenge(p, 'a', new Date(2026, 9, 5 + i, 7));
      seen.add((ch.steps[0] as { count: number }).count);
    }
    expect(seen.size).toBe(3);
  });
  it('empty pool falls back to the base challenge', () => {
    expect(resolveChallenge(plan({ mode: 'random', challenge: c(7) }), 'a', new Date())).toEqual(c(7));
  });
});

describe('generateWeeklyPlan', () => {
  it('follows the example plan when all resources exist', () => {
    const p = generateWeeklyPlan({ photoTargetIds: ['sky', 'mirror', 'mug'], qrTargetIds: ['bath'], stepsAvailable: true });
    expect(p[1]!.steps[0]).toMatchObject({ kind: 'photo', photoTargetId: 'sky' });
    expect(p[2]!.steps[0]).toMatchObject({ kind: 'qr', qrTargetId: 'bath' });
    expect(p[3]!.steps[0]).toMatchObject({ kind: 'math', count: 5 });
    expect(p[4]!.steps[0]).toMatchObject({ kind: 'photo', photoTargetId: 'mirror' });
    expect(p[5]!.steps[0]).toMatchObject({ kind: 'steps', steps: 100 });
    expect(p[6]!.steps.length).toBeGreaterThanOrEqual(3);
    expect(p[7]!.steps[0]).toMatchObject({ kind: 'photo', photoTargetId: 'mug' });
  });
  it('degrades to math/steps without targets', () => {
    const p = generateWeeklyPlan({ photoTargetIds: [], qrTargetIds: [], stepsAvailable: false });
    for (const d of [1, 2, 3, 4, 5, 6, 7] as const) {
      for (const s of p[d]!.steps) expect(s.kind).toBe('math');
    }
  });
});

it('referencedTargets collects ids from all plan parts', () => {
  const p = plan({
    mode: 'weekday',
    challenge: { steps: [{ kind: 'qr', qrTargetId: 'q1' }] },
    weekdayPlan: { 2: { steps: [{ kind: 'photo', photoTargetId: 'p1', strictness: 'easy' }] } },
    pool: [{ steps: [{ kind: 'photo', photoTargetId: 'p2', strictness: 'hard' }] }],
  });
  const r = referencedTargets(p);
  expect([...r.qr]).toEqual(['q1']);
  expect([...r.photo].sort()).toEqual(['p1', 'p2']);
});

it('summaries and hash are stable', () => {
  expect(challengeSummary({ steps: [{ kind: 'photo', photoTargetId: 'x', strictness: 'easy' }, { kind: 'math', count: 3, difficulty: 'easy' }] })).toBe('Fotka → Matematika');
  expect(hash32('abc')).toBe(hash32('abc'));
  expect(hash32('abc')).not.toBe(hash32('abd'));
});
