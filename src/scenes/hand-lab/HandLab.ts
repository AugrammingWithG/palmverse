import * as THREE from 'three';
import { createGlowTexture } from '../../core/fx';
import type { HandData, HandFrame } from '../../core/handTypes';
import { FINGERTIPS, NUM_LANDMARKS, type Side } from '../../core/landmarks';
import type { Experience, SceneContext } from '../types';
import { handLabConfig as C } from './config';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const TIP_SET = new Set<number>(FINGERTIPS);

/** Debug visuals for one hand: joints, palm orb + orientation ring, normal, pinch spark. */
class HandRig {
  readonly group = new THREE.Group();
  private joints: THREE.InstancedMesh;
  private jointMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private orb: THREE.Mesh;
  private orbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private halo: THREE.Sprite;
  private ring: THREE.Mesh;
  private ringMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, side: THREE.DoubleSide });
  private normalLine: THREE.Line;
  private spark: THREE.Sprite;
  private sparkFlash = 0;

  constructor(private side: Side, glowTex: THREE.Texture, sphereGeo: THREE.BufferGeometry) {
    this.joints = new THREE.InstancedMesh(sphereGeo, this.jointMat, NUM_LANDMARKS);
    this.joints.frustumCulled = false;
    this.orb = new THREE.Mesh(sphereGeo, this.orbMat);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), this.ringMat);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.normalLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ transparent: true, toneMapped: false }));
    this.spark = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.group.add(this.joints, this.orb, this.halo, this.ring, this.normalLine, this.spark);
  }

  flashPinch(): void {
    this.sparkFlash = 1;
  }

  update(hand: HandData | null, dt: number): void {
    this.group.visible = !!hand;
    if (!hand) return;
    const fade = hand.presence;
    const base = _c.set(this.side === 'left' ? C.leftColor : C.rightColor);
    const size = hand.palmSize;

    // Joints
    this.joints.visible = C.showJoints;
    this.jointMat.color.copy(base).multiplyScalar(C.glow * 0.8);
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const r = (TIP_SET.has(i) ? C.tipSize : C.jointSize) * size * fade;
      _m.compose(hand.world[i], _q.identity(), _s.setScalar(r));
      this.joints.setMatrixAt(i, _m);
    }
    this.joints.instanceMatrix.needsUpdate = true;

    // Palm orb floats above the palm along its normal, breathing with openness
    const open = hand.openness;
    _p.copy(hand.palmCenter).addScaledVector(hand.palmNormal, C.orbLift * size);
    const orbR = C.orbSize * size * (0.3 + 0.7 * open) * fade;
    this.orb.position.copy(_p);
    this.orb.scale.setScalar(orbR);
    this.orbMat.color.copy(base).multiplyScalar(C.glow * (0.35 + 0.65 * open));

    this.halo.position.copy(_p);
    this.halo.scale.setScalar(orbR * 7);
    this.halo.material.color.copy(base).multiplyScalar(0.5 + open * 0.6);
    this.halo.material.opacity = fade;

    // Ring lies in the palm plane: watch it roll with tilt
    this.ring.position.copy(_p);
    this.ring.quaternion.copy(hand.palmQuaternion);
    this.ring.scale.setScalar(Math.max(orbR, size * 0.12) * 1.9);
    this.ringMat.color.copy(base).multiplyScalar(C.glow * 0.6);
    this.ringMat.opacity = 0.85 * fade;

    this.normalLine.visible = C.showNormal;
    this.normalLine.position.copy(hand.palmCenter);
    this.normalLine.quaternion.setFromUnitVectors(_s.set(0, 0, 1), hand.palmNormal);
    this.normalLine.scale.setScalar(size * 1.1);
    const lm = this.normalLine.material as THREE.LineBasicMaterial;
    lm.color.copy(base).multiplyScalar(C.glow);
    lm.opacity = fade;

    // Pinch spark between thumb and index
    this.sparkFlash = Math.max(0, this.sparkFlash - dt * 3);
    const ps = hand.pinchStrength;
    this.spark.position.copy(hand.pinchPoint);
    this.spark.scale.setScalar(size * (0.15 + ps * 0.7 + this.sparkFlash * 1.2) * fade);
    this.spark.material.color.setRGB(1, 0.95, 0.85).multiplyScalar(0.3 + ps * 1.6 + this.sparkFlash * 2);
    this.spark.material.opacity = Math.min(1, ps * 1.5 + this.sparkFlash) * fade;
  }
}

/** Expanding ring for clap events. */
class Burst {
  readonly mesh: THREE.Mesh;
  age = Infinity;
  private strength = 1;

  constructor(geo: THREE.BufferGeometry) {
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.visible = false;
  }

  fire(pos: THREE.Vector3, strength: number): void {
    this.mesh.position.copy(pos);
    this.age = 0;
    this.strength = strength;
  }

  update(dt: number): void {
    this.age += dt;
    const life = 1.1;
    this.mesh.visible = this.age < life;
    if (!this.mesh.visible) return;
    const t = this.age / life;
    const ease = 1 - Math.pow(1 - t, 3);
    this.mesh.scale.setScalar(0.2 + ease * 3.2 * this.strength);
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(C.clapColor).multiplyScalar(3 * (1 - t));
    mat.opacity = 1 - t;
  }
}

export default class HandLab implements Experience {
  private rigs!: Record<Side, HandRig>;
  private bursts: Burst[] = [];
  private nextBurst = 0;

  init(ctx: SceneContext): void {
    const glowTex = createGlowTexture();
    const sphereGeo = new THREE.IcosahedronGeometry(1, 3);
    this.rigs = {
      left: new HandRig('left', glowTex, sphereGeo),
      right: new HandRig('right', glowTex, sphereGeo),
    };
    ctx.root.add(this.rigs.left.group, this.rigs.right.group);

    const ringGeo = new THREE.RingGeometry(0.92, 1, 96);
    for (let i = 0; i < 4; i++) {
      const b = new Burst(ringGeo);
      this.bursts.push(b);
      ctx.root.add(b.mesh);
    }

    const g = ctx.gui;
    g.addColor(C, 'leftColor').name('left color');
    g.addColor(C, 'rightColor').name('right color');
    g.add(C, 'glow', 0.5, 8, 0.1);
    g.add(C, 'jointSize', 0.01, 0.2, 0.005).name('joint size');
    g.add(C, 'tipSize', 0.01, 0.3, 0.005).name('tip size');
    g.add(C, 'orbSize', 0.05, 1, 0.01).name('orb size');
    g.add(C, 'orbLift', -1, 2, 0.01).name('orb lift');
    g.add(C, 'showJoints').name('joints');
    g.add(C, 'showNormal').name('palm normal');
  }

  update(hands: HandFrame, dt: number): void {
    for (const e of hands.events) {
      if (e.type === 'pinchstart') this.rigs[e.side].flashPinch();
      if (e.type === 'clap') {
        this.bursts[this.nextBurst].fire(e.position, e.strength);
        this.nextBurst = (this.nextBurst + 1) % this.bursts.length;
      }
    }
    this.rigs.left.update(hands.left, dt);
    this.rigs.right.update(hands.right, dt);
    for (const b of this.bursts) b.update(dt);
  }

  dispose(): void {
    // Everything lives under ctx.root and is disposed by the scene manager.
  }
}
