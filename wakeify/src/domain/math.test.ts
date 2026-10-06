import { describe, expect, it } from 'vitest';

import { checkAnswer, generateProblems, seededRng } from './math';

// Evaluate the displayed expression independently to verify the stored answer.
function evaluate(text: string): number {
  const js = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!/^[\d\s+\-*/()]+$/.test(js)) throw new Error(`unexpected expression ${text}`);
  return Function(`return (${js});`)() as number;
}

describe('math challenge', () => {
  for (const level of ['easy', 'medium', 'hard'] as const) {
    it(`${level}: answers match expressions, integers only, positive`, () => {
      const rng = seededRng(42);
      for (let i = 0; i < 300; i++) {
        const [p] = generateProblems(1, level, rng);
        const v = evaluate(p.text);
        expect(v).toBe(p.answer);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    });
  }
  it('difficulty increases answer magnitude', () => {
    const avg = (lvl: 'easy' | 'medium' | 'hard') =>
      generateProblems(20, lvl, seededRng(7)).reduce((s, p) => s + p.answer, 0) / 20;
    expect(avg('easy')).toBeLessThan(avg('medium'));
    expect(avg('medium')).toBeLessThan(avg('hard'));
  });
  it('generates the requested count without duplicates, clamped to 1..20', () => {
    const ps = generateProblems(10, 'medium', seededRng(1));
    expect(ps).toHaveLength(10);
    expect(new Set(ps.map((p) => p.text)).size).toBe(10);
    expect(generateProblems(0, 'easy')).toHaveLength(1);
    expect(generateProblems(99, 'easy')).toHaveLength(20);
  });
  it('checkAnswer is tolerant to whitespace and unicode minus, strict otherwise', () => {
    const p = { text: '5 − 9', answer: -4 };
    expect(checkAnswer(p, ' -4 ')).toBe(true);
    expect(checkAnswer(p, '−4')).toBe(true);
    expect(checkAnswer(p, '4')).toBe(false);
    expect(checkAnswer(p, '-4.0')).toBe(false);
    expect(checkAnswer(p, '')).toBe(false);
  });
});
