/**
 * Accelerometer-based step detector, used when the OS step counter
 * (Android TYPE_STEP_COUNTER / iOS CMPedometer) is unavailable or the user
 * denied motion permission. Classic approach: magnitude → low-pass →
 * dynamic-threshold peak detection with a refractory period.
 */
export type AccelSample = { x: number; y: number; z: number; t: number }; // g units, ms

export type StepDetectorOptions = {
  /** Minimum peak above the running mean, in g. */
  threshold: number;
  /** Minimum time between two steps (ms). Human cadence tops out ~3.5 steps/s. */
  minIntervalMs: number;
  /** Maximum time between steps before cadence resets (ms). */
  maxIntervalMs: number;
  /** Low-pass smoothing factor (0..1, higher = smoother). */
  smoothing: number;
};

export const DEFAULT_STEP_OPTIONS: StepDetectorOptions = {
  threshold: 0.12,
  minIntervalMs: 280,
  maxIntervalMs: 2000,
  smoothing: 0.7,
};

export class StepDetector {
  private filtered: number | null = null;
  private mean = 1;
  private prev = 0;
  private rising = false;
  private lastStepAt = -Infinity;
  private pendingSteps = 0;
  steps = 0;

  constructor(private readonly opts: StepDetectorOptions = DEFAULT_STEP_OPTIONS) {}

  /** Feed one sample; returns the total step count. */
  push(s: AccelSample): number {
    const mag = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
    this.filtered = this.filtered == null ? mag : this.opts.smoothing * this.filtered + (1 - this.opts.smoothing) * mag;
    this.mean = 0.98 * this.mean + 0.02 * this.filtered;
    const v = this.filtered;
    if (v > this.prev) this.rising = true;
    else if (this.rising && v < this.prev) {
      // local maximum at prev
      this.rising = false;
      const since = s.t - this.lastStepAt;
      if (this.prev - this.mean > this.opts.threshold && since >= this.opts.minIntervalMs) {
        if (since > this.opts.maxIntervalMs) {
          // Require two peaks in rhythm before counting, to ignore single shakes.
          this.pendingSteps = 1;
        } else {
          this.steps += this.pendingSteps + 1;
          this.pendingSteps = 0;
        }
        this.lastStepAt = s.t;
      }
    }
    this.prev = v;
    return this.steps;
  }
}
