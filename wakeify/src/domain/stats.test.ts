import { describe, expect, it } from 'vitest';

import { computeStats } from './stats';
import type { WakeEvent } from './types';

process.env.TZ = 'Europe/Prague';

let n = 0;
function ev(day: number, opts: Partial<WakeEvent> & { lateMin?: number } = {}): WakeEvent {
  const scheduledFor = new Date(2026, 9, day, 7, 0).getTime();
  const late = opts.lateMin ?? 2;
  return {
    id: `e${n++}`,
    alarmId: 'a',
    alarmLabel: 'Ráno',
    scheduledFor,
    ringStartedAt: scheduledFor,
    dismissedAt: opts.outcome === 'missed' ? null : scheduledFor + late * 60000,
    snoozeCount: 0,
    outcome: 'success',
    challengeKinds: ['math'],
    challengeDurationMs: 40000,
    ...opts,
  };
}

describe('computeStats', () => {
  const now = new Date(2026, 9, 10, 12);

  it('empty history', () => {
    const s = computeStats([], 10, now);
    expect(s.totalRings).toBe(0);
    expect(s.successRate).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.last7Days.every((d) => d.status === 'none')).toBe(true);
  });

  it('streaks skip alarm-free days but break on late/missed days', () => {
    const events = [
      ev(1),
      ev(2),
      ev(3, { lateMin: 25 }), // late → breaks
      ev(4),
      ev(5),
      // 6, 7 no alarms (weekend)
      ev(8),
      ev(9),
    ];
    const s = computeStats(events, 10, now);
    expect(s.currentStreak).toBe(4);
    expect(s.bestStreak).toBe(4);
    expect(s.onTimeDays).toBe(6);
    expect(s.successRate).toBe(1);
  });

  it('a missed ring breaks the streak and lowers the success rate', () => {
    const s = computeStats([ev(1), ev(2), ev(3, { outcome: 'missed' })], 10, now);
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.missed).toBe(1);
    expect(s.successRate).toBeCloseTo(2 / 3);
  });

  it('top wake times bucket by 15 minutes', () => {
    const s = computeStats([ev(1, { lateMin: 1 }), ev(2, { lateMin: 3 }), ev(3, { lateMin: 20 })], 30, now);
    expect(s.topWakeTimes[0]).toEqual({ label: '07:00', count: 2 });
    expect(s.topWakeTimes[1]).toEqual({ label: '07:15', count: 1 });
    expect(s.averageWakeMinutes).toBe(7 * 60 + 8);
    expect(s.averageChallengeSeconds).toBe(40);
  });

  it('last 7 days show per-day status', () => {
    const s = computeStats([ev(9), ev(10, { lateMin: 30 }), ev(8, { outcome: 'missed' })], 10, now);
    const tail = s.last7Days.slice(-3).map((d) => d.status);
    expect(tail).toEqual(['missed', 'onTime', 'late']);
  });
});
