import * as THREE from 'three';

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _o = new THREE.Vector3();

/**
 * A tube rebuilt every frame around a polyline (tentacles, fish and dragon
 * bodies). uv.x goes around, uv.y goes from head (0) to tail (1).
 */
export class DynamicTube {
  readonly geometry = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  private prevN = new THREE.Vector3();

  constructor(readonly count: number, readonly radial: number) {
    const ring = radial + 1;
    this.pos = new Float32Array(count * ring * 3);
    this.nrm = new Float32Array(count * ring * 3);
    const uv = new Float32Array(count * ring * 2);
    const index: number[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < ring; j++) {
        uv[(i * ring + j) * 2] = j / radial;
        uv[(i * ring + j) * 2 + 1] = i / (count - 1);
        if (i < count - 1 && j < radial) {
          const a = i * ring + j;
          const b = a + ring;
          index.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /**
   * @param radius radius at point i (t = i / (count - 1))
   * @param up optional fixed "up" (e.g. toward the camera) so flattened bodies keep their back facing it
   * @param heightScale scales the cross-section along up (1 = round)
   */
  update(points: THREE.Vector3[], radius: (i: number, t: number) => number, up?: THREE.Vector3, heightScale = 1): void {
    const n = this.count;
    const ring = this.radial + 1;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (i === 0) _t.subVectors(points[1], p);
      else if (i === n - 1) _t.subVectors(p, points[i - 1]);
      else _t.subVectors(points[i + 1], points[i - 1]);
      if (_t.lengthSq() < 1e-12) _t.set(0, -1, 0);
      _t.normalize();

      if (up) {
        _n.copy(up).addScaledVector(_t, -up.dot(_t));
        if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x);
      } else if (i === 0) {
        _n.set(0, 0, 1).addScaledVector(_t, -_t.z);
        if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x);
      } else {
        // Parallel transport keeps the ring from twisting
        _n.copy(this.prevN).addScaledVector(_t, -this.prevN.dot(_t));
        if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1).addScaledVector(_t, -_t.z);
      }
      _n.normalize();
      this.prevN.copy(_n);
      _b.crossVectors(_t, _n);

      const r = radius(i, i / (n - 1));
      for (let j = 0; j < ring; j++) {
        const a = (j / this.radial) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        _o.copy(_b).multiplyScalar(c).addScaledVector(_n, s);
        const k = (i * ring + j) * 3;
        this.pos[k] = p.x + (_b.x * c + _n.x * s * heightScale) * r;
        this.pos[k + 1] = p.y + (_b.y * c + _n.y * s * heightScale) * r;
        this.pos[k + 2] = p.z + (_b.z * c + _n.z * s * heightScale) * r;
        this.nrm[k] = _o.x;
        this.nrm[k + 1] = _o.y;
        this.nrm[k + 2] = _o.z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}
