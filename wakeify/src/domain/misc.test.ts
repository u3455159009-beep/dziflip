import { describe, expect, it } from 'vitest';

import { newQrPayload, qrMatches, qrMatrix, qrSvgDocument, qrSvgPath } from './qr';
import { seededRng } from './math';
import { StepDetector } from './stepDetector';

describe('QR', () => {
  it('payloads are prefixed and unique', () => {
    const rng = seededRng(3);
    const a = newQrPayload(rng);
    const b = newQrPayload(rng);
    expect(a.startsWith('WAKEIFY:')).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toHaveLength(24);
  });
  it('matching is exact (whitespace-tolerant)', () => {
    expect(qrMatches('WAKEIFY:ABC', ' WAKEIFY:ABC\n')).toBe(true);
    expect(qrMatches('WAKEIFY:ABC', 'WAKEIFY:ABD')).toBe(false);
  });
  it('produces a valid QR matrix with finder patterns', () => {
    const m = qrMatrix('WAKEIFY:TESTTESTTESTTEST');
    expect(m.size).toBeGreaterThanOrEqual(21);
    // top-left finder pattern: dark corner, light ring at (1,1)
    expect(m.isDark(0, 0)).toBe(true);
    expect(m.isDark(1, 1)).toBe(false);
    expect(m.isDark(3, 3)).toBe(true);
    const { d } = qrSvgPath('WAKEIFY:TESTTESTTESTTEST');
    expect(d.startsWith('M0 0h1v1h-1z')).toBe(true);
    expect(qrSvgDocument('X', 'Koupelna <1>')).toContain('Koupelna &lt;1&gt;');
  });
});

describe('StepDetector', () => {
  const walk = (steps: number, hz = 50, cadence = 1.8) => {
    const d = new StepDetector();
    const total = Math.round((steps / cadence) * hz);
    let count = 0;
    for (let i = 0; i < total; i++) {
      const t = (i / hz) * 1000;
      const phase = (2 * Math.PI * cadence * i) / hz;
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 0.02;
      count = d.push({ x: 0.05 * Math.sin(phase / 2), y: 0.02, z: 1 + 0.35 * Math.sin(phase) + noise, t });
    }
    return count;
  };

  it('counts steps of a simulated walk within ±10 %', () => {
    const c = walk(60);
    expect(c).toBeGreaterThanOrEqual(54);
    expect(c).toBeLessThanOrEqual(66);
  });

  it('ignores a phone lying still', () => {
    const d = new StepDetector();
    let c = 0;
    for (let i = 0; i < 500; i++) c = d.push({ x: 0, y: 0, z: 1 + ((i % 3) - 1) * 0.005, t: i * 20 });
    expect(c).toBe(0);
  });

  it('ignores a single shake', () => {
    const d = new StepDetector();
    let c = 0;
    for (let i = 0; i < 200; i++) {
      const z = i >= 50 && i < 60 ? 1 + Math.sin(((i - 50) / 10) * Math.PI) : 1;
      c = d.push({ x: 0, y: 0, z, t: i * 20 });
    }
    expect(c).toBe(0);
  });
});
