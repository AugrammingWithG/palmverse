import * as THREE from 'three';
import { damp, hash, pointPixelScale } from '../../core/fx';
import type { HandData, HandFrame } from '../../core/handTypes';
import type { QualityLevel } from '../../core/renderer';
import type { Experience, SceneContext } from '../types';
import { ParticlePool, type Creature } from './common';
import { puppetConfig as C } from './config';
import { Jellyfish } from './jellyfish';
import { bubbleMaterial, moteMaterial, sparkMaterial } from './materials';
import { Dragon, Koi } from './swimmers';

const MAX_MOTES = 260;
const NAMES = ['Jellyfish', 'Koi', 'Dragon'];
const BUOYANCY = new THREE.Vector3();
const SPARK_DRAG = new THREE.Vector3();

export default class FingerPuppet implements Experience {
  private ctx!: SceneContext;
  private creatures: Creature[] = [];
  private fades = [1, 0, 0];
  private active = 0;
  private time = 0;
  private bubbles!: ParticlePool;
  private bubbleMat = bubbleMaterial();
  private sparks!: ParticlePool;
  private sparkMat = sparkMaterial(C.dragon.breathColor);
  private motes!: THREE.Points;
  private moteMat = moteMaterial();

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const h = ctx.viewport.worldHeight;
    this.creatures = [new Jellyfish(h), new Koi(h), new Dragon(h)];
    this.creatures.forEach((c, i) => {
      c.group.visible = i === this.active;
      ctx.root.add(c.group);
    });

    this.bubbles = new ParticlePool(160, this.bubbleMat, 0.6);
    this.sparks = new ParticlePool(220, this.sparkMat);
    const seeds = new Float32Array(MAX_MOTES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i * 1.37 + 0.2);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MOTES * 3), 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    ctx.root.add(this.bubbles.points, this.sparks.points, this.motes);
    this.applyCounts();

    this.buildGui();
  }

  private buildGui(): void {
    const g = this.ctx.gui;
    g.add(C, 'preferHand', ['right', 'left']).name('driving hand');
    g.add({ next: () => this.cycle() }, 'next').name('next creature (C)');
    const w = g.addFolder('Water');
    w.addColor(C, 'waterTint').name('tint');
    w.add(C, 'waterAmount', 0, 1, 0.01).name('tint amount');
    w.add(C, 'bubbleRate', 0, 40, 0.5).name('bubble rate');
    w.add(C, 'bubbleCount', 0, 160, 1).name('max bubbles').onFinishChange(() => this.applyCounts());
    w.add(C, 'moteCount', 0, MAX_MOTES, 1).name('plankton').onFinishChange(() => this.applyCounts());

    const j = g.addFolder('Jellyfish').close();
    j.add(C.jelly, 'bellSize', 0.2, 1.5, 0.01).name('bell size');
    j.add(C.jelly, 'tentacleLength', 0.5, 5, 0.05).name('tentacle length');
    j.add(C.jelly, 'fingerGrip', 1, 60, 1).name('finger grip');
    j.add(C.jelly, 'damping', 0.8, 0.99, 0.005);
    j.add(C.jelly, 'drift', -2, 3, 0.05);
    j.add(C.jelly, 'pulseRate', 0.1, 3, 0.05).name('pulse rate');
    j.addColor(C.jelly, 'colorA').name('color A');
    j.addColor(C.jelly, 'colorB').name('color B');
    j.add(C.jelly, 'glow', 0, 5, 0.05);

    const k = g.addFolder('Koi').close();
    k.add(C.koi, 'length', 1, 6, 0.05);
    k.add(C.koi, 'width', 0.1, 0.8, 0.01);
    k.add(C.koi, 'swim', 0, 0.3, 0.005);
    k.add(C.koi, 'finSpread', 0, 2, 0.05).name('fin spread');
    k.addColor(C.koi, 'colorBody').name('body');
    k.addColor(C.koi, 'colorPatch').name('patches');
    k.addColor(C.koi, 'colorGlow').name('glow color');
    k.add(C.koi, 'glow', 0, 4, 0.05);

    const d = g.addFolder('Dragon').close();
    d.add(C.dragon, 'length', 2, 10, 0.1);
    d.add(C.dragon, 'width', 0.04, 0.4, 0.005);
    d.add(C.dragon, 'swim', 0, 0.3, 0.005);
    d.addColor(C.dragon, 'colorBody').name('body');
    d.addColor(C.dragon, 'colorBelly').name('belly');
    d.addColor(C.dragon, 'colorMane').name('mane');
    d.add(C.dragon, 'glow', 0, 4, 0.05);
    d.addColor(C.dragon, 'breathColor')
      .name('breath')
      .onChange(() => this.sparkMat.uniforms.uColor.value.set(C.dragon.breathColor));
  }

  private applyCounts(): void {
    const q = this.ctx.quality.particleScale;
    this.bubbles.limit = Math.max(1, Math.round(C.bubbleCount * q));
    this.motes.geometry.setDrawRange(0, Math.round(C.moteCount * q));
  }

  onQualityChange(_level: QualityLevel): void {
    this.applyCounts();
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'c') return false;
    this.cycle();
    return true;
  }

  private cycle(): void {
    this.active = (this.active + 1) % this.creatures.length;
    this.ctx.toast(NAMES[this.active]);
  }

  private pickHand(hands: HandFrame): HandData | null {
    const pref = C.preferHand === 'right' ? hands.right : hands.left;
    const other = C.preferHand === 'right' ? hands.left : hands.right;
    if (pref && pref.presence > 0.05) return pref;
    return other && other.presence > 0.05 ? other : null;
  }

  update(hands: HandFrame, dt: number): void {
    this.time += dt;
    const hand = this.pickHand(hands);

    // Crossfade: the old creature shrinks away while the new one grows in
    this.creatures.forEach((c, i) => {
      const target = i === this.active ? 1 : 0;
      this.fades[i] += (target - this.fades[i]) * damp(target ? 5 : 8, dt);
      if (this.fades[i] < 0.01 && target === 0) {
        c.group.visible = false;
        return;
      }
      c.group.visible = true;
      const eased = this.fades[i] * this.fades[i] * (3 - 2 * this.fades[i]);
      c.update(hand, dt, this.time, eased);
      if (i === this.active) c.emit?.(this.bubbles, this.sparks, dt);
    });
    const cur = this.creatures[this.active];

    const S = cur.size;
    BUOYANCY.set(0, S * 0.35, 0);
    this.bubbles.update(dt, BUOYANCY, 0.8, this.time);
    this.sparks.update(dt, SPARK_DRAG.set(0, S * 0.6, 0), 2.2, this.time);

    const px = pointPixelScale(this.ctx.renderer, this.ctx.camera);
    this.bubbleMat.uniforms.uPxScale.value = px;
    this.sparkMat.uniforms.uPxScale.value = px;
    const mu = this.moteMat.uniforms;
    mu.uTime.value = this.time;
    mu.uPxScale.value = px;
    mu.uCenter.value.lerp(cur.center, damp(1.5, dt));
    mu.uRadius.value = S * 2.6;
    (mu.uColor.value as THREE.Color).set(C.jelly.colorA);

    // Underwater mood on the webcam
    const g = this.ctx.grade;
    g.tint.setRGB(1, 1, 1).lerp(new THREE.Color(C.waterTint), C.waterAmount);
    g.brightness = 1 - C.waterAmount * 0.35;
    g.saturation = 1 - C.waterAmount * 0.2;
  }

  dispose(): void {
    // Meshes live under ctx.root and are disposed by the scene manager.
  }
}
