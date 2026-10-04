import type { IsoWeekday } from './types';

export type ScheduleRule = {
  hour: number;
  minute: number;
  weekdays: IsoWeekday[];
  enabled: boolean;
  skipUntil: number | null;
};

export const ALL_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
export const WORKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5];
export const WEEKEND: IsoWeekday[] = [6, 7];

/** JS Date.getDay() (0 = Sunday) → ISO weekday (1 = Monday … 7 = Sunday). */
export function isoWeekday(date: Date): IsoWeekday {
  const d = date.getDay();
  return (d === 0 ? 7 : d) as IsoWeekday;
}

/**
 * Next local wall-clock occurrence of the rule strictly after `now`.
 *
 * Uses the device's current time zone (the JS `Date` local calendar), so the
 * result automatically follows time-zone and DST changes: we re-evaluate the
 * rule on every sync rather than storing absolute timestamps. Within a DST
 * spring-forward gap the JS engine moves the time forward (02:30 → 03:30),
 * which matches the behaviour of the native engines.
 */
export function nextOccurrence(rule: ScheduleRule, now: Date): Date | null {
  if (!rule.enabled) return null;
  const after = Math.max(now.getTime(), rule.skipUntil != null ? rule.skipUntil - 1 : -Infinity);
  const base = new Date(after);
  // 8 days covers every weekday plus "today but already passed".
  for (let i = 0; i <= 8; i++) {
    const candidate = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + i,
      rule.hour,
      rule.minute,
      0,
      0,
    );
    if (candidate.getTime() <= after) continue;
    if (rule.weekdays.length === 0 || rule.weekdays.includes(isoWeekday(candidate))) {
      return candidate;
    }
  }
  return null;
}

/** Upcoming occurrences (for previews and tests). */
export function upcomingOccurrences(rule: ScheduleRule, now: Date, count: number): Date[] {
  const out: Date[] = [];
  let cursor = now;
  for (let i = 0; i < count; i++) {
    const next = nextOccurrence({ ...rule, skipUntil: i === 0 ? rule.skipUntil : null }, cursor);
    if (!next) break;
    out.push(next);
    if (rule.weekdays.length === 0) break; // one-shot
    cursor = next;
  }
  return out;
}

const WEEKDAY_SHORT: Record<IsoWeekday, string> = {
  1: 'Po',
  2: 'Út',
  3: 'St',
  4: 'Čt',
  5: 'Pá',
  6: 'So',
  7: 'Ne',
};

const WEEKDAY_LONG: Record<IsoWeekday, string> = {
  1: 'Pondělí',
  2: 'Úterý',
  3: 'Středa',
  4: 'Čtvrtek',
  5: 'Pátek',
  6: 'Sobota',
  7: 'Neděle',
};

export function weekdayShort(d: IsoWeekday): string {
  return WEEKDAY_SHORT[d];
}

export function weekdayLong(d: IsoWeekday): string {
  return WEEKDAY_LONG[d];
}

export function describeRepeat(weekdays: IsoWeekday[]): string {
  const set = [...new Set(weekdays)].sort((a, b) => a - b);
  if (set.length === 0) return 'Jednorázově';
  if (set.length === 7) return 'Každý den';
  if (set.length === 5 && WORKDAYS.every((d) => set.includes(d))) return 'Pracovní dny';
  if (set.length === 2 && WEEKEND.every((d) => set.includes(d))) return 'Víkendy';
  return set.map(weekdayShort).join(' ');
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** "za 7 h 05 min", "za 12 min", "za méně než minutu". */
export function formatCountdown(target: Date, now: Date): string {
  const totalMin = Math.floor((target.getTime() - now.getTime()) / 60000);
  if (totalMin < 1) return 'za méně než minutu';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `za ${days} d ${hours} h`;
  if (hours > 0) return `za ${hours} h ${pad2(minutes)} min`;
  return `za ${minutes} min`;
}

/** "dnes", "zítra", or the weekday name. */
export function relativeDayLabel(target: Date, now: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(target) - startOf(now)) / 86400000);
  if (diffDays === 0) return 'dnes';
  if (diffDays === 1) return 'zítra';
  return weekdayLong(isoWeekday(target)).toLowerCase();
}

/** Picks the alarm with the soonest next occurrence. */
export function soonest<T extends ScheduleRule>(
  rules: T[],
  now: Date,
): { item: T; at: Date } | null {
  let best: { item: T; at: Date } | null = null;
  for (const item of rules) {
    const at = nextOccurrence(item, now);
    if (at && (!best || at.getTime() < best.at.getTime())) best = { item, at };
  }
  return best;
}
