import * as THREE from 'three';
import type { HandData } from '../../core/handTypes';

export interface Creature {
  readonly group: THREE.Group;
  /** Where ambient particles gather. */
  readonly center: THREE.Vector3;
  /** Body scale in world units (≈ palm size), for particle sizing. */
  readonly size: number;
  /** fade: 0..1 crossfade when switching creatures. */
  update(hand: HandData | null, dt: number, time: number, fade: number): void;
  /** Called every frame so the creature can spawn bubbles/sparks. */
  emit?(bubbles: ParticlePool, sparks: ParticlePool, dt: number): void;
}

/**
 * Flat fan in the XY plane pointing along +x (fins). uv.x runs across the fan,
 * uv.y from root (0) to edge (1). edge(u) shapes the outline (e.g. a forked tail).
 */
export function fanGeometry(span: number, edge: (u: number) => number = () => 1, cols = 24): THREE.BufferGeometry {
  const rows = 4;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const v = r / rows;
      const a = (u - 0.5) * span;
      const rad = v * edge(u);
      pos.push(Math.cos(a) * rad, Math.sin(a) * rad, 0);
      uv.push(u, v);
      if (r < rows && c < cols) {
        const i = r * (cols + 1) + c;
        index.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/** Simple CPU particle pool rendered as points (bubbles, sparks). */
export class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private next = 0;
  /** Live particle budget (≤ capacity), for quality scaling. */
  limit: number;

  constructor(readonly capacity: number, material: THREE.ShaderMaterial, private wobble = 0) {
    this.limit = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    this.points = new THREE.Points(g, material);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % Math.max(1, Math.min(this.limit, this.capacity));
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  update(dt: number, accel: THREE.Vector3, drag: number, time: number): void {
    const d = Math.exp(-drag * dt);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alphaAttr.array[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k] = (this.vel[k] + accel.x * dt) * d + Math.sin(time * 3 + i * 1.7) * this.wobble * dt;
      this.vel[k + 1] = (this.vel[k + 1] + accel.y * dt) * d;
      this.vel[k + 2] = (this.vel[k + 2] + accel.z * dt) * d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.alphaAttr.array[i] = Math.min(1, t * 8) * (1 - t * t);
      this.sizeAttr.array[i] = this.size[i] * (0.6 + 0.4 * Math.min(1, t * 4));
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}

/** Where a creature should go: the finger when tracked, a lazy wander otherwise. */
export class Wander {
  readonly target = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  private seed = Math.random() * 100;

  update(time: number, radius: number): THREE.Vector3 {
    const t = time + this.seed;
    return this.target.set(
      this.home.x + Math.sin(t * 0.37) * radius * 1.3 + Math.sin(t * 0.91) * radius * 0.3,
      this.home.y + Math.sin(t * 0.53 + 1.3) * radius * 0.7,
      0,
    );
  }
}
