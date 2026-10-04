import { describe, expect, it } from 'vitest';

import {
  describeRepeat,
  formatCountdown,
  isoWeekday,
  nextOccurrence,
  relativeDayLabel,
  soonest,
  upcomingOccurrences,
  type ScheduleRule,
} from './schedule';

process.env.TZ = 'Europe/Prague';

const rule = (p: Partial<ScheduleRule>): ScheduleRule => ({
  hour: 7,
  minute: 0,
  weekdays: [],
  enabled: true,
  skipUntil: null,
  ...p,
});
// Local-time helper (TZ=Europe/Prague)
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('nextOccurrence', () => {
  it('one-shot later today', () => {
    expect(nextOccurrence(rule({}), at(2026, 10, 5, 6, 0))).toEqual(at(2026, 10, 5, 7, 0));
  });
  it('one-shot tomorrow when time already passed', () => {
    expect(nextOccurrence(rule({}), at(2026, 10, 5, 7, 30))).toEqual(at(2026, 10, 6, 7, 0));
  });
  it('exactly at alarm time goes to the next occurrence', () => {
    expect(nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), at(2026, 10, 5, 7, 0))).toEqual(
      at(2026, 10, 6, 7, 0),
    );
  });
  it('workdays: Friday evening → Monday', () => {
    // 2026-10-09 is a Friday
    expect(isoWeekday(at(2026, 10, 9))).toBe(5);
    expect(nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5] }), at(2026, 10, 9, 20))).toEqual(at(2026, 10, 12, 7, 0));
  });
  it('single weekday a week ahead', () => {
    // Monday 2026-10-05 08:00, alarm Mondays 07:00 → next Monday
    expect(nextOccurrence(rule({ weekdays: [1] }), at(2026, 10, 5, 8))).toEqual(at(2026, 10, 12, 7, 0));
  });
  it('disabled → null', () => {
    expect(nextOccurrence(rule({ enabled: false }), at(2026, 10, 5))).toBeNull();
  });
  it('skipUntil skips the next ring', () => {
    const r = rule({ weekdays: [1, 2, 3, 4, 5, 6, 7], skipUntil: at(2026, 10, 6, 7, 0).getTime() + 1 });
    expect(nextOccurrence(r, at(2026, 10, 5, 22))).toEqual(at(2026, 10, 7, 7, 0));
  });
  it('skipUntil exactly at an occurrence keeps that occurrence', () => {
    const r = rule({ weekdays: [1, 2, 3, 4, 5, 6, 7], skipUntil: at(2026, 10, 6, 7, 0).getTime() });
    expect(nextOccurrence(r, at(2026, 10, 5, 22))).toEqual(at(2026, 10, 6, 7, 0));
  });
  it('DST fall-back (25h day) keeps wall-clock 07:00', () => {
    // 2026-10-25 03:00 CEST → 02:00 CET
    const next = nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), at(2026, 10, 24, 8));
    expect(next).toEqual(at(2026, 10, 25, 7, 0));
    expect(next!.getHours()).toBe(7);
    expect(next!.getTime() - at(2026, 10, 24, 7).getTime()).toBe(25 * 3600 * 1000);
  });
  it('DST spring-forward (23h day) keeps wall-clock 07:00', () => {
    const next = nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), at(2026, 3, 28, 8));
    expect(next).toEqual(at(2026, 3, 29, 7, 0));
    expect(next!.getTime() - at(2026, 3, 28, 7).getTime()).toBe(23 * 3600 * 1000);
  });
  it('alarm inside the DST gap (02:30) is moved forward, not dropped', () => {
    const next = nextOccurrence(rule({ hour: 2, minute: 30, weekdays: [7] }), at(2026, 3, 28, 12));
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(29);
    expect(next!.getHours()).toBe(3);
  });
});

describe('time-zone change', () => {
  it('re-evaluates in the new zone: 07:00 stays 07:00 local', () => {
    const now = new Date(Date.UTC(2026, 9, 5, 3, 0)); // 05:00 Prague / 23:00 NY (prev day)
    process.env.TZ = 'America/New_York';
    const ny = nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), now)!;
    expect(ny.getHours()).toBe(7);
    process.env.TZ = 'Europe/Prague';
    const prague = nextOccurrence(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), now)!;
    expect(prague.getHours()).toBe(7);
    expect(ny.getTime()).not.toBe(prague.getTime());
  });
});

describe('helpers', () => {
  it('upcomingOccurrences lists consecutive repeat days', () => {
    const list = upcomingOccurrences(rule({ weekdays: [1, 3, 5] }), at(2026, 10, 5, 8), 3);
    expect(list.map((d) => d.getDate())).toEqual([7, 9, 12]);
  });
  it('upcomingOccurrences of one-shot has a single entry', () => {
    expect(upcomingOccurrences(rule({}), at(2026, 10, 5, 8), 5)).toHaveLength(1);
  });
  it('describeRepeat', () => {
    expect(describeRepeat([])).toBe('Jednorázově');
    expect(describeRepeat([1, 2, 3, 4, 5])).toBe('Pracovní dny');
    expect(describeRepeat([6, 7])).toBe('Víkendy');
    expect(describeRepeat([1, 2, 3, 4, 5, 6, 7])).toBe('Každý den');
    expect(describeRepeat([3, 1])).toBe('Po St');
  });
  it('formatCountdown', () => {
    const now = at(2026, 10, 5, 22, 0);
    expect(formatCountdown(at(2026, 10, 6, 7, 5), now)).toBe('za 9 h 05 min');
    expect(formatCountdown(at(2026, 10, 5, 22, 12), now)).toBe('za 12 min');
    expect(formatCountdown(at(2026, 10, 5, 22, 0, ), now)).toBe('za méně než minutu');
  });
  it('relativeDayLabel', () => {
    const now = at(2026, 10, 5, 22);
    expect(relativeDayLabel(at(2026, 10, 5, 23), now)).toBe('dnes');
    expect(relativeDayLabel(at(2026, 10, 6, 7), now)).toBe('zítra');
    expect(relativeDayLabel(at(2026, 10, 8, 7), now)).toBe('čtvrtek');
  });
  it('soonest picks the earliest enabled alarm', () => {
    const now = at(2026, 10, 5, 22);
    const r = soonest(
      [
        { ...rule({ hour: 8 }), id: 'a' },
        { ...rule({ hour: 6, enabled: false }), id: 'b' },
        { ...rule({ hour: 6, minute: 30 }), id: 'c' },
      ],
      now,
    );
    expect(r!.item.id).toBe('c');
  });
});
