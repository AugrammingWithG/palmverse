import * as THREE from 'three';
import { damp } from '../../core/fx';
import type { HandData } from '../../core/handTypes';
import { LM } from '../../core/landmarks';
import { VerletChain, followTheLeader } from './chain';
import { Wander, fanGeometry, type Creature, type ParticlePool } from './common';
import { puppetConfig } from './config';
import { finMaterial, skinMaterial, tentacleMaterial } from './materials';
import { DynamicTube } from './tube';

const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * Body that traces the index fingertip's path (follow-the-leader spine) and
 * swims with a traveling side-to-side wave. Seen from above, back toward the camera.
 */
abstract class SpineCreature implements Creature {
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3();
  size = 1;
  protected spine: THREE.Vector3[];
  /** Spine + swim wave: what gets rendered. */
  protected body: THREE.Vector3[];
  protected tangent: THREE.Vector3[];
  protected side: THREE.Vector3[];
  protected head = new THREE.Vector3();
  protected speed = 0;
  protected swimPhase = 0;
  protected spread = 0.5;
  protected pinch = 0;
  private wander = new Wander();
  private initialized = false;
  private lastHead = new THREE.Vector3();
  private target = new THREE.Vector3();

  constructor(protected n: number, viewportHeight: number) {
    const mk = () => Array.from({ length: n }, () => new THREE.Vector3());
    this.spine = mk();
    this.body = mk();
    this.tangent = mk();
    this.side = mk();
    this.wander.home.set(0, viewportHeight * 0.05, 0);
  }

  abstract update(hand: HandData | null, dt: number, time: number, fade: number): void;

  protected updateSpine(hand: HandData | null, dt: number, time: number, lengthPalms: number, swim: number): void {
    const held = !!hand && hand.presence > 0.05;
    if (held) this.size += (hand!.palmSize - this.size) * damp(6, dt);
    const S = this.size;

    if (held) {
      // Lazy circles around the fingertip keep it swimming when the hand is still
      const tip = hand!.world[LM.INDEX_TIP];
      const r = S * 0.35;
      this.target.set(tip.x + Math.cos(time * 1.5) * r, tip.y + Math.sin(time * 1.9) * r * 0.7, tip.z);
      this.wander.home.copy(tip);
      this.spread += (hand!.spread - this.spread) * damp(8, dt);
      this.pinch = hand!.pinchStrength;
    } else {
      this.target.copy(this.wander.update(time * 0.8, S * 1.4));
      this.spread += (0.5 - this.spread) * damp(2, dt);
      this.pinch = 0;
    }

    if (!this.initialized) {
      this.head.copy(this.target);
      for (let i = 0; i < this.n; i++) this.spine[i].copy(this.target).add(_v.set(0, -i * 0.01, 0));
      this.lastHead.copy(this.head);
      this.initialized = true;
    }
    this.head.lerp(this.target, damp(held ? 9 : 2, dt));
    const segLen = (S * lengthPalms) / (this.n - 1);
    followTheLeader(this.spine, this.head, segLen);

    this.speed += (this.head.distanceTo(this.lastHead) / Math.max(dt, 1e-3) / S - this.speed) * damp(4, dt);
    this.lastHead.copy(this.head);
    this.swimPhase += dt * (3 + Math.min(this.speed, 5) * 2.2);
    const amp = S * swim * (0.7 + Math.min(this.speed, 4) * 0.35);

    // Tangents/sides from the spine, then add the traveling wave along the sides
    for (let i = 0; i < this.n; i++) {
      const a = this.spine[Math.max(0, i - 1)];
      const b = this.spine[Math.min(this.n - 1, i + 1)];
      this.tangent[i].subVectors(a, b).normalize(); // points toward the head
      this.side[i].crossVectors(Z, this.tangent[i]).normalize();
    }
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const w = Math.sin(this.swimPhase - t * 7) * amp * (0.15 + t);
      this.body[i].copy(this.spine[i]).addScaledVector(this.side[i], w);
    }
    for (let i = 0; i < this.n; i++) {
      const a = this.body[Math.max(0, i - 1)];
      const b = this.body[Math.min(this.n - 1, i + 1)];
      this.tangent[i].subVectors(a, b).normalize();
      this.side[i].crossVectors(Z, this.tangent[i]).normalize();
    }
    this.center.copy(this.body[Math.floor(this.n * 0.35)]);
  }

  /** Places a flat fin (fan pointing +x) at p, pointing along dir in the screen plane. */
  protected placeFin(mesh: THREE.Object3D, p: THREE.Vector3, dir: THREE.Vector3, length: number, width: number): void {
    mesh.position.copy(p);
    mesh.rotation.set(0, 0, Math.atan2(dir.y, dir.x));
    mesh.scale.set(length, width, 1);
  }
}

export class Koi extends SpineCreature {
  private tube: DynamicTube;
  private skin = skinMaterial(0);
  private finMat = finMaterial();
  private finL: THREE.Mesh;
  private finR: THREE.Mesh;
  private tail: THREE.Mesh;
  private eyes: THREE.Mesh[];

  constructor(viewportHeight: number) {
    const K = puppetConfig.koi;
    super(K.segments, viewportHeight);
    this.tube = new DynamicTube(K.segments, 14);
    const bodyMesh = new THREE.Mesh(this.tube.geometry, this.skin);
    bodyMesh.frustumCulled = false;

    const pec = fanGeometry(1.1, (u) => 0.75 + 0.25 * Math.sin(u * Math.PI));
    this.finL = new THREE.Mesh(pec, this.finMat);
    this.finR = new THREE.Mesh(pec, this.finMat);
    // Forked, flowing tail
    this.tail = new THREE.Mesh(fanGeometry(1.5, (u) => 1 - 0.45 * Math.exp(-Math.pow((u - 0.5) / 0.14, 2))), this.finMat);
    const eyeGeo = new THREE.SphereGeometry(1, 12, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#0b0c14' });
    this.eyes = [new THREE.Mesh(eyeGeo, eyeMat), new THREE.Mesh(eyeGeo, eyeMat)];
    // Fins glow over the body edge instead of hiding beneath it
    this.finMat.depthTest = false;
    for (const m of [this.finL, this.finR, this.tail]) {
      m.frustumCulled = false;
      m.renderOrder = 2;
    }
    this.group.add(this.finL, this.finR, this.tail, bodyMesh, ...this.eyes);
  }

  update(hand: HandData | null, dt: number, time: number, fade: number): void {
    const K = puppetConfig.koi;
    this.updateSpine(hand, dt, time, K.length, K.swim);
    const S = this.size;
    const W = S * K.width * fade;
    const radius = (t: number) => {
      const head = Math.sin(Math.min(t / 0.16, 1) * Math.PI * 0.5);
      const tail = 1 - 0.85 * THREE.MathUtils.smoothstep(t, 0.28, 1);
      return Math.max(0.0001, W * (0.15 + 0.85 * head) * tail * (t === 0 ? 0.3 : 1));
    };
    this.tube.update(this.body, (_i, t) => radius(t), Z, 0.85);

    // Pectoral fins open with finger spread
    const open = (0.75 + this.spread * 0.95) * K.finSpread;
    const flap = Math.sin(this.swimPhase * 0.7) * 0.18;
    const fi = Math.round((this.n - 1) * 0.2);
    const p = this.body[fi];
    const r = radius(fi / (this.n - 1));
    for (const [mesh, sign] of [[this.finL, 1], [this.finR, -1]] as const) {
      // side = Z × tangent, so swinging toward +side from "backward" is a clockwise turn
      const ang = Math.PI - sign * (open + flap);
      _v.copy(this.tangent[fi]).applyAxisAngle(Z, ang);
      _w.copy(p).addScaledVector(this.side[fi], sign * r * 0.92);
      this.placeFin(mesh, _w, _v, S * 0.55 * fade, S * (0.32 + this.spread * 0.28) * fade);
    }
    const last = this.n - 1;
    _v.copy(this.tangent[last]).negate();
    _v.applyAxisAngle(Z, Math.sin(this.swimPhase - 7) * 0.35);
    this.placeFin(this.tail, this.body[last], _v, S * 0.75 * fade, S * (0.45 + this.spread * 0.4) * fade);

    // Eyes near the head, on the back side
    const ei = Math.round((this.n - 1) * 0.07);
    const er = radius(ei / (this.n - 1));
    this.eyes.forEach((e, k) => {
      e.position.copy(this.body[ei]).addScaledVector(this.side[ei], (k ? -1 : 1) * er * 0.62);
      e.position.z += er * 0.55;
      e.scale.setScalar(er * 0.2);
    });

    const u = this.skin.uniforms;
    u.uTime.value = time;
    u.uBody.value.set(K.colorBody);
    u.uPatch.value.set(K.colorPatch);
    u.uGlowColor.value.set(K.colorGlow);
    u.uGlow.value = K.glow;
    const f = this.finMat.uniforms;
    f.uColor.value.set(K.colorGlow);
    f.uGlow.value = K.glow * 1.3;
    f.uFade.value = fade;
    f.uTime.value = time;
  }

  emit(bubbles: ParticlePool, _sparks: ParticlePool, dt: number): void {
    if (Math.random() < puppetConfig.bubbleRate * 0.25 * dt) {
      _v.copy(this.body[0]).addScaledVector(this.tangent[0], this.size * 0.05);
      bubbles.emit(_v, _w.set((Math.random() - 0.5) * 0.2, 0.5, 0).multiplyScalar(this.size), this.size * (0.04 + Math.random() * 0.06), 3);
    }
  }
}

export class Dragon extends SpineCreature {
  private tube: DynamicTube;
  private skin = skinMaterial(1);
  private maneMat = finMaterial();
  private mane: THREE.InstancedMesh;
  private maneCount: number;
  private horns: THREE.Mesh[];
  private hornMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private eyeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private eyes: THREE.Mesh[];
  private whiskers: { chain: VerletChain; tube: DynamicTube }[] = [];
  private whiskerMat = tentacleMaterial();
  private breath = 0;

  constructor(viewportHeight: number) {
    const D = puppetConfig.dragon;
    super(D.segments, viewportHeight);
    this.tube = new DynamicTube(D.segments, 12);
    const bodyMesh = new THREE.Mesh(this.tube.geometry, this.skin);
    bodyMesh.frustumCulled = false;

    this.maneCount = Math.floor((D.segments - 6) / 2);
    this.mane = new THREE.InstancedMesh(fanGeometry(0.35, () => 1, 6), this.maneMat, this.maneCount * 2);
    this.mane.frustumCulled = false;
    this.mane.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const hornGeo = new THREE.ConeGeometry(0.5, 1, 8).rotateZ(-Math.PI / 2).translate(0.5, 0, 0); // points +x
    this.horns = [new THREE.Mesh(hornGeo, this.hornMat), new THREE.Mesh(hornGeo, this.hornMat)];
    const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
    this.eyes = [new THREE.Mesh(eyeGeo, this.eyeMat), new THREE.Mesh(eyeGeo, this.eyeMat)];
    for (let k = 0; k < 2; k++) {
      const tube = new DynamicTube(12, 4);
      const mesh = new THREE.Mesh(tube.geometry, this.whiskerMat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.whiskers.push({ chain: new VerletChain(12, 0.05), tube });
    }
    this.group.add(this.mane, bodyMesh, ...this.horns, ...this.eyes);
  }

  update(hand: HandData | null, dt: number, time: number, fade: number): void {
    const D = puppetConfig.dragon;
    this.updateSpine(hand, dt, time, D.length, D.swim);
    const S = this.size;
    const W = S * D.width * fade;
    const radius = (t: number) => {
      const snout = Math.sin(Math.min(t / 0.025, 1) * Math.PI * 0.5);
      const headBump = 1.5 * Math.exp(-Math.pow((t - 0.035) / 0.022, 2));
      const body = THREE.MathUtils.smoothstep(t, 0.05, 0.12) * (1 - 0.9 * THREE.MathUtils.smoothstep(t, 0.3, 1));
      return Math.max(0.0001, W * snout * (Math.max(headBump, body) + 0.12 * (1 - t)));
    };
    this.tube.update(this.body, (_i, t) => radius(t), Z, 0.9);

    // Mane blades along both flanks, flaring with finger spread
    const flare = 0.25 + this.spread * 1.0;
    for (let k = 0; k < this.maneCount; k++) {
      const i = 6 + k * 2;
      const t = i / (this.n - 1);
      const r = radius(t);
      for (const sign of [1, -1]) {
        const ang = Math.PI - sign * (flare + Math.sin(time * 4 - t * 12) * 0.12);
        _v.copy(this.tangent[i]).applyAxisAngle(Z, ang);
        _w.copy(this.body[i]).addScaledVector(this.side[i], sign * r * 0.8);
        _w.z -= 0.01;
        const len = S * 0.42 * (1 - t * 0.65) * fade;
        _m.compose(_w, _q.setFromAxisAngle(Z, Math.atan2(_v.y, _v.x)), _s.set(len, len * 0.9, 1));
        this.mane.setMatrixAt(k * 2 + (sign > 0 ? 0 : 1), _m);
      }
    }
    this.mane.instanceMatrix.needsUpdate = true;

    // Horns sweep back from the head, eyes glow, whiskers trail
    const hi = 2;
    const hr = radius(0.035);
    const head = this.body[hi];
    this.horns.forEach((h, k) => {
      const sign = k ? -1 : 1;
      _v.copy(this.tangent[hi]).applyAxisAngle(Z, Math.PI - sign * 0.45);
      h.position.copy(head).addScaledVector(this.side[hi], sign * hr * 0.5);
      h.position.z += hr * 0.4;
      h.rotation.set(0, 0, Math.atan2(_v.y, _v.x));
      h.scale.set(S * 0.32 * fade, hr * 0.35, hr * 0.35);
    });
    this.eyes.forEach((e, k) => {
      e.position.copy(this.body[1]).addScaledVector(this.side[1], (k ? -1 : 1) * hr * 0.55);
      e.position.z += hr * 0.6;
      e.scale.setScalar(hr * 0.22);
    });
    this.whiskers.forEach((w, k) => {
      const sign = k ? -1 : 1;
      const root = _w.copy(this.body[0]).addScaledVector(this.side[0], sign * hr * 0.3);
      w.chain.segLen = (S * 0.9) / 11;
      w.chain.step(Math.min(dt, 1 / 30), {
        root,
        damping: 0.9,
        accel: _v.copy(this.side[0]).multiplyScalar(sign * S * 1.5),
        wave: (i, out) => out.copy(this.side[0]).multiplyScalar(Math.sin(time * 5 - i * 0.6) * S * 0.25 * sign),
      });
      w.tube.update(w.chain.pos, (_i, t) => S * 0.012 * (1 - t * 0.8) * fade);
    });

    this.breath += ((this.pinch > 0.6 ? 1 : 0) - this.breath) * damp(8, dt);

    const u = this.skin.uniforms;
    u.uTime.value = time;
    u.uBody.value.set(D.colorBody);
    u.uPatch.value.set(D.colorBelly);
    u.uGlowColor.value.set(D.colorMane);
    u.uGlow.value = D.glow;
    const m = this.maneMat.uniforms;
    m.uColor.value.set(D.colorMane);
    m.uGlow.value = D.glow * 1.4;
    m.uFade.value = fade;
    m.uTime.value = time;
    this.hornMat.color.set(D.colorBelly).multiplyScalar(1.4);
    this.eyeMat.color.set(D.breathColor).multiplyScalar(3 + this.breath * 4);
    const wu = this.whiskerMat.uniforms;
    wu.uTime.value = time;
    wu.uColorA.value.set(D.colorBelly);
    wu.uColorB.value.set(D.colorMane);
    wu.uGlow.value = D.glow;
    wu.uFade.value = fade;
  }

  emit(bubbles: ParticlePool, sparks: ParticlePool, dt: number): void {
    const S = this.size;
    // Pinch → glowing breath out of the mouth
    if (this.breath > 0.1) {
      const n = Math.ceil(160 * this.breath * dt);
      for (let k = 0; k < n; k++) {
        _v.copy(this.body[0]).addScaledVector(this.tangent[0], S * 0.1);
        _w.copy(this.tangent[0])
          .applyAxisAngle(Z, (Math.random() - 0.5) * 0.5)
          .multiplyScalar(S * (2.5 + Math.random() * 2));
        sparks.emit(_v, _w, S * (0.1 + Math.random() * 0.16), 0.7 + Math.random() * 0.6);
      }
    }
    if (Math.random() < puppetConfig.bubbleRate * 0.15 * dt) {
      _v.copy(this.body[Math.floor(Math.random() * this.n)]);
      bubbles.emit(_v, _w.set(0, 0.5, 0).multiplyScalar(S), S * (0.03 + Math.random() * 0.05), 3);
    }
  }
}
