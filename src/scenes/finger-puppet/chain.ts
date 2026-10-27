import * as THREE from 'three';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export interface VerletStep {
  root: THREE.Vector3;
  /** Per-node targets (null = free). Used to glue the first joints to a finger. */
  targets?: (THREE.Vector3 | null)[];
  targetStiffness?: number;
  damping: number;
  /** Constant acceleration (world units / s²), e.g. sinking or current. */
  accel?: THREE.Vector3;
  /** Extra per-node displacement per second for waving. */
  wave?: (i: number, out: THREE.Vector3) => THREE.Vector3;
  iterations?: number;
}

/** Rope of points: root pinned, the rest trails with inertia and length constraints. */
export class VerletChain {
  readonly pos: THREE.Vector3[];
  private prev: THREE.Vector3[];

  constructor(readonly count: number, public segLen: number, start = new THREE.Vector3(), dir = new THREE.Vector3(0, -1, 0)) {
    this.pos = Array.from({ length: count }, () => new THREE.Vector3());
    this.prev = Array.from({ length: count }, () => new THREE.Vector3());
    this.reset(start, dir);
  }

  reset(start: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < this.count; i++) {
      this.pos[i].copy(start).addScaledVector(dir, i * this.segLen);
      this.prev[i].copy(this.pos[i]);
    }
  }

  step(dt: number, s: VerletStep): void {
    const dt2 = dt * dt;
    const n = this.count;
    const k = 1 - Math.exp(-(s.targetStiffness ?? 20) * dt);
    for (let i = 1; i < n; i++) {
      const p = this.pos[i];
      _v.subVectors(p, this.prev[i]).multiplyScalar(s.damping);
      this.prev[i].copy(p);
      p.add(_v);
      if (s.accel) p.addScaledVector(s.accel, dt2);
      if (s.wave) p.addScaledVector(s.wave(i, _d), dt);
      const t = s.targets?.[i];
      if (t) p.lerp(t, k);
    }
    this.pos[0].copy(s.root);
    this.prev[0].copy(s.root);

    const iters = s.iterations ?? 3;
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < n; i++) {
        const a = this.pos[i - 1];
        const b = this.pos[i];
        _d.subVectors(b, a);
        const len = _d.length() || 1e-6;
        const diff = (len - this.segLen) / len;
        // Root side is pinned on the first segment
        if (i === 1) b.addScaledVector(_d, -diff);
        else {
          a.addScaledVector(_d, diff * 0.5);
          b.addScaledVector(_d, -diff * 0.5);
        }
      }
    }
  }

  /** Teleport everything by an offset (keeps velocities). */
  translate(offset: THREE.Vector3): void {
    for (let i = 0; i < this.count; i++) {
      this.pos[i].add(offset);
      this.prev[i].add(offset);
    }
  }
}

/**
 * Follow-the-leader spine: node 0 goes to the head, every other node is pulled
 * to sit one segment behind its predecessor, so the body traces the head's path.
 */
export function followTheLeader(points: THREE.Vector3[], head: THREE.Vector3, segLen: number): void {
  points[0].copy(head);
  for (let i = 1; i < points.length; i++) {
    _d.subVectors(points[i], points[i - 1]);
    const len = _d.length();
    if (len < 1e-6) _d.set(0, -1, 0);
    else _d.divideScalar(len);
    points[i].copy(points[i - 1]).addScaledVector(_d, segLen);
  }
}
