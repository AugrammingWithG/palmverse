import * as THREE from 'three';
import { damp } from '../../core/fx';
import type { HandData } from '../../core/handTypes';
import { FINGER_CHAINS, FINGER_NAMES } from '../../core/landmarks';
import { VerletChain } from './chain';
import { Wander, type Creature, type ParticlePool } from './common';
import { puppetConfig } from './config';
import { bellMaterial, tentacleMaterial } from './materials';
import { DynamicTube } from './tube';

const C = puppetConfig.jelly;
const UP = new THREE.Vector3(0, 1, 0);
const ORAL_ARMS = 4;

interface Strand {
  chain: VerletChain;
  tube: DynamicTube;
  mesh: THREE.Mesh;
  /** Rim angle for hair strands / oral arms. */
  angle: number;
  kind: 'finger' | 'hair' | 'arm';
  finger?: number;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _targets: (THREE.Vector3 | null)[] = [];
const _targetPool = Array.from({ length: 64 }, () => new THREE.Vector3());

/** Samples the polyline at arc length d; returns false once past the end. */
function samplePolyline(pts: THREE.Vector3[], d: number, out: THREE.Vector3): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = pts[i].distanceTo(pts[i + 1]);
    if (d <= seg) {
      out.lerpVectors(pts[i], pts[i + 1], seg > 0 ? d / seg : 0);
      return true;
    }
    d -= seg;
  }
  return false;
}

export class Jellyfish implements Creature {
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3();
  size = 1;
  private bell: THREE.Mesh;
  private inner: THREE.Mesh;
  private bellMat = bellMaterial();
  private tentMat = tentacleMaterial();
  private hairMat = tentacleMaterial();
  private armMat = tentacleMaterial();
  private strands: Strand[] = [];
  private bellPos = new THREE.Vector3();
  private bellUp = new THREE.Vector3(0, 1, 0);
  private bellQuat = new THREE.Quaternion();
  private phase = 0;
  private pulse = 0;
  private wander = new Wander();
  private initialized = false;
  private lastPos = new THREE.Vector3();
  private speed = 0;
  /** Rim root + PIP/DIP/TIP of the current finger. */
  private fingerPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  constructor(viewportHeight: number) {
    const bellGeo = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI * 0.52);
    this.bell = new THREE.Mesh(bellGeo, this.bellMat);
    this.inner = new THREE.Mesh(bellGeo, this.bellMat);
    this.inner.scale.setScalar(0.62);
    this.inner.position.y = -0.05;
    this.bell.add(this.inner);
    this.group.add(this.bell);

    const seg = C.tentacleSegments;
    for (let f = 0; f < 5; f++) this.addStrand('finger', seg, 6, this.tentMat, 0, f);
    for (let i = 0; i < C.hairCount; i++) this.addStrand('hair', seg + 4, 3, this.hairMat, (i / C.hairCount) * Math.PI * 2 + 0.3);
    for (let i = 0; i < ORAL_ARMS; i++) this.addStrand('arm', 12, 6, this.armMat, (i / ORAL_ARMS) * Math.PI * 2);
    this.wander.home.set(0, viewportHeight * 0.08, 0);
  }

  private addStrand(kind: Strand['kind'], count: number, radial: number, mat: THREE.Material, angle: number, finger?: number): void {
    const tube = new DynamicTube(count, radial);
    const mesh = new THREE.Mesh(tube.geometry, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.strands.push({ chain: new VerletChain(count, 0.1), tube, mesh, angle, kind, finger });
  }

  update(hand: HandData | null, dt: number, time: number, fade: number): void {
    const held = !!hand && hand.presence > 0.05;
    const s = held ? hand!.palmSize : this.size;
    this.size += (s - this.size) * damp(6, dt);
    const S = this.size;

    // Bell sits on the palm; its dome points toward the wrist so tentacles flow along the fingers
    if (held) {
      this.bellUp.copy(hand!.palmUp).negate();
      this.bellPos.copy(hand!.palmCenter).addScaledVector(hand!.palmUp, -0.05 * S);
      this.wander.home.copy(this.bellPos);
    } else {
      this.bellUp.lerp(UP, damp(1.5, dt)).normalize();
      this.wander.update(time * 0.6, S * 0.6);
      this.bellPos.lerp(this.wander.target, damp(0.8, dt));
    }
    if (!this.initialized) {
      this.center.copy(this.bellPos);
      this.lastPos.copy(this.bellPos);
    }
    this.center.lerp(this.bellPos, held ? 1 : damp(4, dt));

    this.speed += (this.center.distanceTo(this.lastPos) / Math.max(dt, 1e-3) / S - this.speed) * damp(5, dt);
    this.lastPos.copy(this.center);

    _q.setFromUnitVectors(UP, this.bellUp);
    this.bellQuat.slerp(_q, this.initialized ? damp(14, dt) : 1);
    this.phase += dt * Math.PI * 2 * (C.pulseRate + Math.min(this.speed, 4) * 0.25);
    this.pulse = Math.pow(Math.max(0, Math.sin(this.phase)), 2);

    this.bell.position.copy(this.center);
    this.bell.quaternion.copy(this.bellQuat);
    this.bell.scale.setScalar(S * C.bellSize * fade);

    // Frame on the rim plane
    const rimR = S * C.bellSize * (1 - this.pulse * 0.2);
    _side.set(1, 0, 0).applyQuaternion(this.bellQuat);
    _fwd.set(0, 0, 1).applyQuaternion(this.bellQuat);
    const down = _w.copy(this.bellUp).negate();

    for (const st of this.strands) {
      const ch = st.chain;
      const len =
        st.kind === 'finger' ? C.tentacleLength : st.kind === 'hair' ? C.tentacleLength * 1.15 : C.tentacleLength * 0.45;
      ch.segLen = (S * len) / (ch.count - 1);

      const root = _v;
      if (st.kind === 'finger' && held) {
        // Root on the rim, in the direction of this finger's knuckle
        const base = hand!.world[FINGER_CHAINS[FINGER_NAMES[st.finger!]][0]];
        root.subVectors(base, this.center);
        root.addScaledVector(this.bellUp, -root.dot(this.bellUp));
        if (root.lengthSq() < 1e-8) root.copy(_side);
        root.normalize().multiplyScalar(rimR * 0.75).add(this.center);
      } else {
        const a = st.kind === 'finger' ? (st.finger! / 5) * Math.PI * 2 : st.angle;
        const r = st.kind === 'arm' ? rimR * 0.18 : rimR * (st.kind === 'hair' ? 0.95 : 0.75);
        root.copy(this.center).addScaledVector(_side, Math.cos(a) * r).addScaledVector(_fwd, Math.sin(a) * r);
      }

      if (!this.initialized) ch.reset(root, down);

      // Glue the first nodes to the finger joints, the rest trails freely past the tip
      _targets.length = ch.count;
      _targets.fill(null);
      if (st.kind === 'finger' && held) {
        const joints = FINGER_CHAINS[FINGER_NAMES[st.finger!]];
        this.fingerPts[0].copy(root);
        for (let j = 1; j < 4; j++) this.fingerPts[j].copy(hand!.world[joints[j]]);
        for (let i = 1; i < ch.count; i++) {
          const t = _targetPool[i];
          if (!samplePolyline(this.fingerPts, i * ch.segLen, t)) break;
          _targets[i] = t;
        }
      }

      const sway = st.kind === 'hair' ? 0.5 : st.kind === 'arm' ? 0.35 : 0.25;
      ch.step(Math.min(dt, 1 / 30), {
        root,
        targets: _targets,
        targetStiffness: C.fingerGrip,
        damping: C.damping,
        accel: _acc.copy(down).multiplyScalar(C.drift * S),
        wave: (i, out) => {
          const w = Math.sin(time * 2.2 - i * 0.55 + st.angle * 3) * sway * S * (i / ch.count);
          return out.copy(_side).multiplyScalar(w);
        },
        iterations: 4,
      });

      const thick = st.kind === 'finger' ? 0.035 : st.kind === 'hair' ? 0.009 : 0.05;
      st.tube.update(ch.pos, (_i, t) => {
        const frill = st.kind === 'arm' ? 0.65 + 0.35 * Math.sin(t * 40 + time * 3) : 1;
        return S * thick * (1 - t * 0.85) * frill * fade;
      });
    }
    this.initialized = true;

    const a = new THREE.Color(C.colorA);
    const b = new THREE.Color(C.colorB);
    for (const m of [this.bellMat, this.tentMat, this.hairMat, this.armMat]) {
      m.uniforms.uTime.value = time;
      m.uniforms.uColorA.value.copy(a);
      m.uniforms.uColorB.value.copy(b);
      m.uniforms.uGlow.value = C.glow;
      m.uniforms.uFade.value = fade;
    }
    this.bellMat.uniforms.uPulse.value = this.pulse;
    this.hairMat.uniforms.uGlow.value = C.glow * 0.8;
    this.armMat.uniforms.uColorA.value.copy(b);
    this.armMat.uniforms.uColorB.value.copy(a);
  }

  emit(bubbles: ParticlePool, _sparks: ParticlePool, dt: number): void {
    // Bubbles shed from the rim on each contraction and when moving fast
    const rate = puppetConfig.bubbleRate * (0.3 + this.pulse * 1.2 + Math.min(this.speed, 3) * 0.6);
    if (Math.random() < rate * dt) {
      const a = Math.random() * Math.PI * 2;
      _v.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(this.bellQuat).multiplyScalar(this.size * C.bellSize).add(this.center);
      bubbles.emit(_v, _w.set((Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.5, 0).multiplyScalar(this.size), this.size * (0.05 + Math.random() * 0.08), 2.5 + Math.random() * 2);
    }
  }
}
