/**
 * One Euro filter (Casiez et al. 2012): adaptive low-pass that is smooth when
 * still and responsive when moving. minCutoff lowers jitter, beta lowers lag.
 */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  private x = 0;
  private dx = 0;
  private initialized = false;

  constructor(private params: OneEuroParams) {}

  reset(): void {
    this.initialized = false;
  }

  filter(value: number, dt: number): number {
    if (!this.initialized || dt <= 0) {
      this.x = value;
      this.dx = 0;
      this.initialized = true;
      return value;
    }
    const { minCutoff, beta, dCutoff } = this.params;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(dCutoff, dt) * (rawDx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
