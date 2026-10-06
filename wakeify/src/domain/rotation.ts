import { isoWeekday } from './schedule';
import type { Challenge, ChallengePlan, ChallengeStep, IsoWeekday } from './types';

export const NO_CHALLENGE: Challenge = { steps: [{ kind: 'none' }] };

export function defaultPlan(): ChallengePlan {
  return {
    mode: 'fixed',
    challenge: { steps: [{ kind: 'math', count: 3, difficulty: 'medium' }] },
    weekdayPlan: {},
    pool: [],
  };
}

/** FNV-1a 32-bit — small, deterministic, good enough for picking an index. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ISO-8601 week number + week-year of a local date. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Days since 1970-01-01 in local calendar terms (DST-safe). */
export function localDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/** Monotonic week counter (weeks since the ISO week containing 1970-01-05, a Monday). */
export function weekIndex(date: Date): number {
  const monday = localDayIndex(date) - (isoWeekday(date) - 1);
  return Math.floor((monday - 4) / 7); // 1970-01-05 is day index 4
}

function isUsable(challenge: Challenge | undefined): challenge is Challenge {
  return !!challenge && challenge.steps.length > 0;
}

/**
 * Decides which challenge applies to a concrete ring.
 * Deterministic for (plan, alarmId, occurrence) so re-opening the ring screen
 * after an app restart never swaps the task under the user's hands.
 */
export function resolveChallenge(plan: ChallengePlan, alarmId: string, occurrence: Date): Challenge {
  const pool = plan.pool.filter(isUsable);
  switch (plan.mode) {
    case 'fixed':
      return isUsable(plan.challenge) ? plan.challenge : NO_CHALLENGE;
    case 'weekday': {
      const day = plan.weekdayPlan[isoWeekday(occurrence)];
      if (isUsable(day)) return day;
      return isUsable(plan.challenge) ? plan.challenge : NO_CHALLENGE;
    }
    case 'weekly': {
      if (pool.length === 0) return isUsable(plan.challenge) ? plan.challenge : NO_CHALLENGE;
      const idx = ((weekIndex(occurrence) % pool.length) + pool.length) % pool.length;
      return pool[idx];
    }
    case 'daily': {
      if (pool.length === 0) return isUsable(plan.challenge) ? plan.challenge : NO_CHALLENGE;
      return pool[localDayIndex(occurrence) % pool.length];
    }
    case 'random': {
      if (pool.length === 0) return isUsable(plan.challenge) ? plan.challenge : NO_CHALLENGE;
      return pool[hash32(`${alarmId}@${occurrence.getTime()}`) % pool.length];
    }
  }
}

export type PlanResources = {
  photoTargetIds: string[];
  qrTargetIds: string[];
  stepsAvailable: boolean;
};

const steps = (n: number): ChallengeStep => ({ kind: 'steps', steps: n });
const math = (count: number, difficulty: 'easy' | 'medium' | 'hard' = 'medium'): ChallengeStep => ({
  kind: 'math',
  count,
  difficulty,
});

/**
 * Builds a varied weekly plan from what the user has set up.
 * Mirrors the product example (Mon photo, Tue QR, Wed math, Thu photo,
 * Fri steps, Sat combined, Sun photo) and degrades gracefully when photo/QR
 * targets or a step counter are not available.
 */
export function generateWeeklyPlan(res: PlanResources): Partial<Record<IsoWeekday, Challenge>> {
  const photo = (i: number): ChallengeStep | null =>
    res.photoTargetIds.length
      ? { kind: 'photo', photoTargetId: res.photoTargetIds[i % res.photoTargetIds.length], strictness: 'medium' }
      : null;
  const qr = (i: number): ChallengeStep | null =>
    res.qrTargetIds.length ? { kind: 'qr', qrTargetId: res.qrTargetIds[i % res.qrTargetIds.length] } : null;
  const walk = (n: number): ChallengeStep | null => (res.stepsAvailable ? steps(n) : null);
  const pick = (...options: (ChallengeStep | null)[]): ChallengeStep =>
    options.find((o): o is ChallengeStep => o !== null) ?? math(5, 'medium');
  const one = (s: ChallengeStep): Challenge => ({ steps: [s] });

  const combined: ChallengeStep[] = [pick(photo(1), qr(0), math(3, 'easy')), math(3, 'medium')];
  const w = walk(50);
  if (w) combined.push(w);

  return {
    1: one(pick(photo(0), qr(0), math(5))),
    2: one(pick(qr(0), walk(50), math(5))),
    3: one(math(5, 'medium')),
    4: one(pick(photo(1), qr(1), math(4, 'hard'))),
    5: one(pick(walk(100), math(6, 'medium'))),
    6: { steps: combined },
    7: one(pick(photo(2), walk(30), math(3, 'easy'))),
  };
}

const KIND_LABEL: Record<ChallengeStep['kind'], string> = {
  none: 'Bez úkolu',
  math: 'Matematika',
  steps: 'Kroky',
  qr: 'QR kód',
  photo: 'Fotka',
};

export function stepLabel(step: ChallengeStep): string {
  switch (step.kind) {
    case 'none':
      return KIND_LABEL.none;
    case 'math':
      return `${step.count}× příklad (${difficultyLabel(step.difficulty).toLowerCase()})`;
    case 'steps':
      return `Ujdi ${step.steps} kroků`;
    case 'qr':
      return 'Naskenuj QR kód';
    case 'photo':
      return 'Vyfoť objekt';
  }
}

export function kindLabel(kind: ChallengeStep['kind']): string {
  return KIND_LABEL[kind];
}

export function difficultyLabel(d: 'easy' | 'medium' | 'hard'): string {
  return d === 'easy' ? 'Lehká' : d === 'medium' ? 'Střední' : 'Těžká';
}

export function challengeSummary(c: Challenge): string {
  if (c.steps.length === 0) return KIND_LABEL.none;
  if (c.steps.length === 1) return stepLabel(c.steps[0]);
  return c.steps.map((s) => KIND_LABEL[s.kind]).join(' → ');
}

export function planSummary(plan: ChallengePlan): string {
  switch (plan.mode) {
    case 'fixed':
      return challengeSummary(plan.challenge);
    case 'weekday':
      return 'Týdenní plán (každý den jiný úkol)';
    case 'weekly':
      return `Každý týden nový úkol (${plan.pool.length})`;
    case 'daily':
      return `Každý den další úkol (${plan.pool.length})`;
    case 'random':
      return `Náhodný úkol (${plan.pool.length})`;
  }
}

/** All targets referenced by a plan — used to warn before deleting a target. */
export function referencedTargets(plan: ChallengePlan): { photo: Set<string>; qr: Set<string> } {
  const photo = new Set<string>();
  const qr = new Set<string>();
  const visit = (c: Challenge | undefined) =>
    c?.steps.forEach((s) => {
      if (s.kind === 'photo') photo.add(s.photoTargetId);
      if (s.kind === 'qr') qr.add(s.qrTargetId);
    });
  visit(plan.challenge);
  Object.values(plan.weekdayPlan).forEach(visit);
  plan.pool.forEach(visit);
  return { photo, qr };
}
