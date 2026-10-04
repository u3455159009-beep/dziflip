import type { Difficulty } from './types';

export type MathProblem = {
  /** Human-readable expression, e.g. "12 × 7 + 5". */
  text: string;
  answer: number;
};

export type Rng = () => number;

/** Mulberry32 seeded PRNG (deterministic tests); defaults to Math.random. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

function easy(rng: Rng): MathProblem {
  if (rng() < 0.5) {
    const a = int(rng, 4, 49);
    const b = int(rng, 3, 49);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = int(rng, 20, 99);
  const b = int(rng, 3, a - 1);
  return { text: `${a} − ${b}`, answer: a - b };
}

function medium(rng: Rng): MathProblem {
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    const a = int(rng, 6, 19);
    const b = int(rng, 3, 9);
    const c = int(rng, 2, 40);
    return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
  }
  if (variant === 1) {
    const a = int(rng, 30, 199);
    const b = int(rng, 30, 199);
    const c = int(rng, 10, 99);
    return { text: `${a} + ${b} − ${c}`, answer: a + b - c };
  }
  const b = int(rng, 3, 12);
  const q = int(rng, 4, 15);
  const c = int(rng, 2, 30);
  return { text: `${b * q} ÷ ${b} + ${c}`, answer: q + c };
}

function hard(rng: Rng): MathProblem {
  const variant = int(rng, 0, 2);
  if (variant === 0) {
    const a = int(rng, 12, 39);
    const b = int(rng, 12, 29);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  if (variant === 1) {
    const a = int(rng, 11, 25);
    const b = int(rng, 6, 15);
    const c = int(rng, 4, 12);
    const d = int(rng, 3, 9);
    return { text: `${a} × ${b} − ${c} × ${d}`, answer: a * b - c * d };
  }
  const a = int(rng, 5, 15);
  const b = int(rng, 20, 90);
  const c = int(rng, 3, 9);
  return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
}

const GENERATORS: Record<Difficulty, (rng: Rng) => MathProblem> = { easy, medium, hard };

export function generateProblem(difficulty: Difficulty, rng: Rng = Math.random): MathProblem {
  return GENERATORS[difficulty](rng);
}

/** `count` problems without duplicates (bounded retries). */
export function generateProblems(count: number, difficulty: Difficulty, rng: Rng = Math.random): MathProblem[] {
  const n = Math.max(1, Math.min(20, Math.round(count)));
  const seen = new Set<string>();
  const out: MathProblem[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 50) {
    const p = generateProblem(difficulty, rng);
    if (seen.has(p.text)) continue;
    seen.add(p.text);
    out.push(p);
  }
  return out;
}

/** Accepts "42", " 42 ", "-7", "−7" (unicode minus). */
export function checkAnswer(problem: MathProblem, input: string): boolean {
  const normalized = input.trim().replace('−', '-');
  if (!/^-?\d+$/.test(normalized)) return false;
  return Number(normalized) === problem.answer;
}
