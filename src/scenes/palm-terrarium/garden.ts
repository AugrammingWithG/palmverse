import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../../core/fx';
import { terrariumConfig as C } from './config';
import { litMaterial, stemMaterial, type SharedLit } from './materials';

const MAX_PLANTS = 14;
const LEAVES_PER_PLANT = 4;
const LEAF_TS = [0.24, 0.4, 0.56, 0.72];
const GOLDEN = 2.39996;
const UP = new THREE.Vector3(0, 1, 0);

interface Plant {
  base: THREE.Vector3;
  height: number;
  radius: number;
  delay: number;
  speed: number;
  growth: number;
  phase: number;
  leafAngle: number;
  leafSize: number;
  flowerSize: number;
  /** Current (smoothed) tip direction. */
  dir: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
}

function leafGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.25, 0.22, 0.7, 0.2, 1, 0);
  s.bezierCurveTo(0.7, -0.2, 0.25, -0.22, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  // Lay it flat (normal +y), then fold along the midrib and droop toward the tip
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, Math.abs(z) * 0.55 - x * x * 0.28);
  }
  g.computeVertexNormals();
  return g;
}

function petalsGeometry(count = 6): THREE.BufferGeometry {
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.SphereGeometry(0.5, 10, 6);
    g.scale(0.32, 0.08, 0.6);
    g.translate(0, 0, 0.38);
    g.rotateX(-0.55); // cup upward
    g.rotateY((i / count) * Math.PI * 2);
    petals.push(g);
  }
  const merged = mergeGeometries(petals)!;
  petals.forEach((g) => g.dispose());
  return merged;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(p0, u * u).addScaledVector(p1, 2 * u * t).addScaledVector(p2, t * t);
}

function bezierTangent(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  out.subVectors(p1, p0).multiplyScalar(2 * (1 - t));
  return out.addScaledVector(_s.subVectors(p2, p1), 2 * t).normalize();
}

/** All plants and mushrooms inside the dome, in terrarium-local space (dome radius 1, ground y = 0). */
export class Garden {
  readonly group = new THREE.Group();
  private plants: Plant[] = [];
  private stems: THREE.InstancedMesh;
  private leaves: THREE.InstancedMesh;
  private petals: THREE.InstancedMesh;
  private centers: THREE.InstancedMesh;
  private centerMat: THREE.ShaderMaterial;
  private capMat: THREE.ShaderMaterial;
  private attrs: Record<'iP0' | 'iP1' | 'iP2' | 'iGrowth' | 'iRadius', THREE.InstancedBufferAttribute>;
  private seed = 1;
  /** Total growth so far, drives sprouting order. */
  private gardenTime = 0;

  constructor(shared: SharedLit) {
    const stemGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 12, true).translate(0, 0.5, 0);
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_PLANTS * n), n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = { iP0: mk(3), iP1: mk(3), iP2: mk(3), iGrowth: mk(1), iRadius: mk(1) };
    for (const [k, a] of Object.entries(this.attrs)) stemGeo.setAttribute(k, a);
    this.stems = new THREE.InstancedMesh(stemGeo, stemMaterial(shared, C.stemColor), MAX_PLANTS);
    this.stems.frustumCulled = false;

    this.leaves = new THREE.InstancedMesh(leafGeometry(), litMaterial(shared, '#ffffff'), MAX_PLANTS * LEAVES_PER_PLANT);
    this.petals = new THREE.InstancedMesh(petalsGeometry(), litMaterial(shared, '#ffffff', 0.08), MAX_PLANTS);
    this.centerMat = litMaterial(shared, '#ffffff', 0.08);
    this.centers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), this.centerMat, MAX_PLANTS);
    for (const m of [this.leaves, this.petals, this.centers]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }

    // A few glowing mushrooms near the rim
    const stemM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.026, 0.1, 6).translate(0, 0.05, 0), litMaterial(shared, '#f1e3cf'), 5);
    this.capMat = litMaterial(shared, '#7fe9ff', 0);
    const capGeo = new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1);
    const capM = new THREE.InstancedMesh(capGeo, this.capMat, 5);
    const r = rng(42);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.62 + r() * 0.24;
      const s = 0.7 + r() * 0.7;
      _p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      _m.compose(_p, _q.setFromAxisAngle(UP, r() * 6), _s.setScalar(s));
      stemM.setMatrixAt(i, _m);
      _p.y = 0.095 * s;
      _m.compose(_p, _q, _s.setScalar(s));
      capM.setMatrixAt(i, _m);
      capM.setColorAt(i, _c.setHSL(0.48 + r() * 0.2, 0.8, 0.6));
    }

    this.group.add(this.stems, this.leaves, this.petals, this.centers, stemM, capM);
    this.reseed();
  }

  reseed(): void {
    const r = rng(this.seed++ * 9973);
    const n = Math.min(MAX_PLANTS, Math.max(1, Math.round(C.plantCount)));
    this.plants = [];
    for (let i = 0; i < n; i++) {
      // Sunflower-seed spiral keeps plants evenly spaced
      const a = i * GOLDEN + r() * 0.5;
      const d = 0.12 + 0.48 * Math.sqrt((i + 0.5) / n) + (r() - 0.5) * 0.06;
      const base = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      const height = (0.5 + r() * 0.36) * (1 - d * 0.3);
      this.plants.push({
        base,
        height,
        radius: 0.018 + r() * 0.01,
        delay: (i / n) * 0.35 + r() * 0.05,
        speed: 0.8 + r() * 0.5,
        growth: 0,
        phase: r() * 10,
        leafAngle: r() * Math.PI * 2,
        leafSize: 0.16 + r() * 0.07,
        flowerSize: 0.13 + r() * 0.06,
        dir: UP.clone(),
        p1: new THREE.Vector3(),
        p2: new THREE.Vector3(),
      });
      const fc = C.flowerColors[Math.floor(r() * C.flowerColors.length)];
      this.petals.setColorAt(i, _c.set(fc));
      this.centers.setColorAt(i, _c.set(fc).lerp(new THREE.Color('#fff2b0'), 0.55));
      for (let l = 0; l < LEAVES_PER_PLANT; l++) {
        this.leaves.setColorAt(i * LEAVES_PER_PLANT + l, _c.set(C.leafColorA).lerp(_c2.set(C.leafColorB), r()));
      }
    }
    for (const m of [this.petals, this.centers, this.leaves]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.gardenTime = 0;
  }

  /**
   * @param growDt growth to add this frame (already scaled by sun/openness)
   * @param sunLocal sun position in terrarium-local space, or null
   * @param lean 0..1 phototropism strength this frame
   * @param wilt 1 = normal, 0 = fully shrunk (reset animation)
   */
  update(dt: number, time: number, growDt: number, sunLocal: THREE.Vector3 | null, lean: number, night: number, wilt: number): void {
    this.gardenTime += growDt;
    const n = this.plants.length;
    const a = this.attrs;

    for (let i = 0; i < n; i++) {
      const pl = this.plants[i];
      if (this.gardenTime > pl.delay) pl.growth = Math.min(1, pl.growth + growDt * pl.speed);

      // Phototropism: tip direction eases toward the sun
      _t.copy(UP);
      if (sunLocal && lean > 0) {
        _p.subVectors(sunLocal, pl.base).normalize();
        if (_p.y < -0.2) _p.y = -0.2; // don't dive into the soil
        _t.lerp(_p.normalize(), lean * C.phototropism).normalize();
      }
      pl.dir.lerp(_t, 1 - Math.exp(-C.leanSpeed * dt)).normalize();

      const sway = C.sway * (1 - night * 0.6);
      const h = pl.height;
      pl.p1.copy(pl.base).addScaledVector(UP, h * 0.5);
      pl.p2.copy(pl.base).addScaledVector(pl.dir, h);
      pl.p2.x += Math.sin(time * 1.3 + pl.phase) * sway * h;
      pl.p2.z += Math.cos(time * 1.1 + pl.phase * 1.7) * sway * h * 0.6;
      // Keep tips inside the glass
      const len = pl.p2.length();
      if (len > 0.9) pl.p2.multiplyScalar(0.9 / len);
      if (pl.p2.y < 0.08) pl.p2.y = 0.08;

      const g = pl.growth * wilt;
      a.iP0.setXYZ(i, pl.base.x, pl.base.y, pl.base.z);
      a.iP1.setXYZ(i, pl.p1.x, pl.p1.y, pl.p1.z);
      a.iP2.setXYZ(i, pl.p2.x, pl.p2.y, pl.p2.z);
      a.iGrowth.setX(i, g);
      a.iRadius.setX(i, pl.radius * (0.4 + 0.6 * Math.min(1, g * 2)));

      // Leaves along the stem, spiralling
      for (let l = 0; l < LEAVES_PER_PLANT; l++) {
        const t = LEAF_TS[l];
        const appear = THREE.MathUtils.smoothstep(g, t + 0.02, t + 0.2);
        const idx = i * LEAVES_PER_PLANT + l;
        if (appear <= 0) {
          this.leaves.setMatrixAt(idx, _m.makeScale(0, 0, 0));
          continue;
        }
        // The stem shader draws curve params [0, g], so a leaf at t appears once the stem passes it
        bezier(pl.base, pl.p1, pl.p2, t, _p);
        bezierTangent(pl.base, pl.p1, pl.p2, t, _t);
        const ang = pl.leafAngle + l * GOLDEN;
        _x.set(Math.cos(ang), 0, Math.sin(ang));
        _x.addScaledVector(_t, -_x.dot(_t)).normalize();
        _x.addScaledVector(_t, 0.45).normalize(); // angle up from the stem
        _z.crossVectors(_x, _t).normalize();
        _y.crossVectors(_z, _x).normalize();
        _m.makeBasis(_x, _y, _z);
        _q.setFromRotationMatrix(_m);
        const droop = 1 - night * 0.25;
        _m.compose(_p, _q, _s.set(1, droop, 1).multiplyScalar(pl.leafSize * appear));
        this.leaves.setMatrixAt(idx, _m);
      }

      // Flower at the tip once mature: opens by day, closes a little and glows at night
      const bloom = THREE.MathUtils.smoothstep(g, 0.8, 1);
      bezier(pl.base, pl.p1, pl.p2, g, _p);
      bezierTangent(pl.base, pl.p1, pl.p2, Math.max(g, 0.01), _t);
      _q.setFromUnitVectors(UP, _t);
      const open = 1 - night * 0.35;
      _m.compose(_p, _q, _s.set(open, 1, open).multiplyScalar(pl.flowerSize * bloom * 1.6));
      this.petals.setMatrixAt(i, _m);
      _m.compose(_p, _q, _s.setScalar(pl.flowerSize * bloom * 0.32));
      this.centers.setMatrixAt(i, _m);
    }

    for (let i = n; i < MAX_PLANTS; i++) {
      a.iGrowth.setX(i, 0);
      a.iRadius.setX(i, 0);
      _m.makeScale(0, 0, 0);
      this.petals.setMatrixAt(i, _m);
      this.centers.setMatrixAt(i, _m);
      for (let l = 0; l < LEAVES_PER_PLANT; l++) this.leaves.setMatrixAt(i * LEAVES_PER_PLANT + l, _m);
    }

    for (const attr of Object.values(a)) attr.needsUpdate = true;
    for (const m of [this.leaves, this.petals, this.centers]) m.instanceMatrix.needsUpdate = true;

    this.centerMat.uniforms.uEmissive.value = 0.08 + night * C.flowerNightGlow;
    this.capMat.uniforms.uEmissive.value = 0.1 + night * 2.4;
  }

  /** Self-illumination of the petals (the terrarium keeps them lit only by the sun). */
  setPetalGlow(v: number): void {
    (this.petals.material as THREE.ShaderMaterial).uniforms.uEmissive.value = v;
  }

  /** 0..1 average maturity, for UI/feedback. */
  get maturity(): number {
    return this.plants.reduce((s, p) => s + p.growth, 0) / Math.max(1, this.plants.length);
  }
}
