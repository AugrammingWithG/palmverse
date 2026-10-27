import * as THREE from 'three';
import { HandAnchor } from '../../core/anchor';
import { createGlowTexture, damp, hash, litUniforms, pointPixelScale } from '../../core/fx';
import type { HandFrame } from '../../core/handTypes';
import type { QualityLevel } from '../../core/renderer';
import type { Experience, SceneContext } from '../types';
import { terrariumConfig as C } from './config';
import { Garden } from './garden';
import { fireflyMaterial, glassMaterial, litMaterial, mossMaterial } from './materials';

const MAX_FIREFLIES = 160;
const MOON = new THREE.Color(0.55, 0.65, 1.0);

export default class PalmTerrarium implements Experience {
  private ctx!: SceneContext;
  private shared = litUniforms();
  private terrarium = new THREE.Group();
  private garden!: Garden;
  private moss!: THREE.ShaderMaterial;
  private glass!: THREE.ShaderMaterial;
  private fireflies!: THREE.Points;
  private fireflyMat!: THREE.ShaderMaterial;
  private sun = new THREE.Group();
  private sunCore!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private sunHalo!: THREE.Sprite;
  private sunRays!: THREE.Sprite;
  private anchor!: HandAnchor;

  private time = 0;
  private night = 0;
  private nightTarget = 0;
  private coverage = 0.18;
  private resetCharge = 0;
  /** >0 while the reset wilt animation runs. */
  private wiltTimer = 0;
  private readonly sunWorld = new THREE.Vector3();
  private readonly sunLocal = new THREE.Vector3();
  private readonly fallbackSun = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const shared = this.shared as unknown as Record<string, THREE.IUniform>;

    // Ground: mossy top, soil sides, dark base
    this.moss = mossMaterial(shared, C.soilColor, C.mossColor);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.97, 72), this.moss);
    top.rotation.x = -Math.PI / 2;
    const soilMat = litMaterial(shared, C.soilColor);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 0.86, 0.26, 72, 1, true).translate(0, -0.13, 0), soilMat);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.86, 48), soilMat);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -0.26;

    this.garden = new Garden(shared);

    // Glass dome + rim
    this.glass = glassMaterial(shared, C.glassColor);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), this.glass);
    dome.renderOrder = 10;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.995, 0.022, 10, 96), this.glass);
    rim.rotation.x = Math.PI / 2;
    rim.renderOrder = 10;

    // Fireflies
    const seeds = new Float32Array(MAX_FIREFLIES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i + 0.5);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_FIREFLIES * 3), 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.fireflyMat = fireflyMaterial(C.fireflyColor);
    this.fireflies = new THREE.Points(fg, this.fireflyMat);
    this.fireflies.frustumCulled = false;
    this.fireflies.renderOrder = 11;
    this.applyFireflyCount();

    this.terrarium.add(top, side, bottom, this.garden.group, dome, rim, this.fireflies);
    ctx.root.add(this.terrarium);

    // Sun that lives in the right palm
    const glowTex = createGlowTexture(128, 1.8);
    this.sunCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ toneMapped: false }));
    const spriteMat = () =>
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.sunHalo = new THREE.Sprite(spriteMat());
    this.sunRays = new THREE.Sprite(spriteMat());
    this.sun.add(this.sunRays, this.sunHalo, this.sunCore);
    ctx.root.add(this.sun);

    this.anchor = new HandAnchor({
      restPosition: new THREE.Vector3(),
      restScale: C.restSize,
      scalePerPalm: C.size,
      lift: C.lift,
      follow: C.follow,
      inheritRoll: 0.35,
    });

    this.buildGui();
  }

  private buildGui(): void {
    const g = this.ctx.gui;
    const place = g.addFolder('Placement');
    place.add(C, 'size', 0.3, 2.5, 0.05).name('dome size (palms)');
    place.add(C, 'lift', -1, 2, 0.01).name('lift (palms)');
    place.add(C, 'follow', 2, 40, 1).name('follow stiffness');
    place.add(C, 'restSize', 0.3, 2, 0.05).name('size at rest');
    place.add(C, 'viewTilt', 0, 1.2, 0.01).name('tilt toward camera');
    const garden = g.addFolder('Garden');
    garden.add(C, 'plantCount', 1, 14, 1).name('plants').onFinishChange(() => this.garden.reseed());
    garden.add(C, 'growthRate', 0, 0.6, 0.005).name('growth rate');
    garden.add(C, 'idleGrowth', 0, 0.1, 0.001).name('idle growth');
    garden.add(C, 'phototropism', 0, 1, 0.01);
    garden.add(C, 'leanSpeed', 0.1, 6, 0.1).name('lean speed');
    garden.add(C, 'sway', 0, 0.2, 0.005);
    garden.add(C, 'mossReach', 1, 10, 0.1).name('moss reach (palms)');
    garden.add(C, 'mossRate', 0, 0.5, 0.005).name('moss rate');
    const look = g.addFolder('Look');
    look.add(C, 'nightSpeed', 0.2, 5, 0.1).name('night speed');
    look.add(C, 'resetHold', 0.5, 5, 0.1).name('two-fist reset (s)');
    look.addColor(C, 'sunColor').name('sun color');
    look.add(C, 'sunGlow', 0, 6, 0.1).name('sun glow');
    look.add(C, 'sunLight', 0, 6, 0.1).name('sun light');
    look.addColor(C, 'ambientDay').name('ambient day');
    look.addColor(C, 'ambientNight').name('ambient night');
    look.addColor(C, 'skyNight').name('night sky tint');
    look.add(C, 'glassOpacity', 0, 1.5, 0.01).name('glass');
    look.add(C, 'flowerNightGlow', 0, 5, 0.1).name('flower night glow');
    const ff = g.addFolder('Fireflies');
    ff.add(C, 'fireflyCount', 0, MAX_FIREFLIES, 1).name('count').onFinishChange(() => this.applyFireflyCount());
    ff.add(C, 'fireflySize', 0.01, 0.2, 0.005).name('size');
    ff.add(C, 'fireflyRange', 0.8, 3, 0.05).name('range');
    ff.addColor(C, 'fireflyColor').name('color');
    g.add({ grow: () => this.growInstantly() }, 'grow').name('🌱 grow fully');
    g.add({ night: () => (this.nightTarget = this.nightTarget > 0.5 ? 0 : 1) }, 'night').name('🌙 toggle night');
    g.add({ reset: () => (this.wiltTimer = 0.7) }, 'reset').name('↺ reset garden');
  }

  private applyFireflyCount(): void {
    this.fireflies.geometry.setDrawRange(0, Math.round(C.fireflyCount * this.ctx.quality.particleScale));
  }

  private growInstantly(): void {
    for (let i = 0; i < 40; i++) this.garden.update(0.1, this.time, 0.2, null, 0, this.night, 1);
    this.coverage = 1;
  }

  onQualityChange(_level: QualityLevel): void {
    this.applyFireflyCount();
  }

  update(hands: HandFrame, dt: number): void {
    this.time += dt;
    const { left, right } = hands;
    const vp = this.ctx.viewport;

    // ---- Placement: dome on the left palm, or resting at the bottom of the screen
    const a = this.anchor.opts;
    a.scalePerPalm = C.size;
    a.lift = C.lift;
    a.follow = C.follow;
    a.restScale = C.restSize;
    a.restPosition.set(0, -vp.worldHeight / 2 + C.restSize * 1.05, 0);
    this.anchor.update(left, dt);
    this.anchor.apply(this.terrarium);
    this.terrarium.rotation.x = C.viewTilt;
    // Gentle bob so it feels alive even when the hand is still
    this.terrarium.position.y += Math.sin(this.time * 1.4) * 0.012 * this.anchor.scale;
    this.terrarium.updateMatrixWorld();
    const scale = this.anchor.scale;

    // ---- Sun: open right palm
    const open = right ? right.openness : 0;
    const sunPresence = right ? right.presence : 0;
    const sunVisual = sunPresence * THREE.MathUtils.smoothstep(open, 0.15, 0.8);
    if (right) {
      this.sunWorld.copy(right.palmCenter).addScaledVector(right.palmNormal, right.palmSize * 0.25);
      this.sun.position.copy(this.sunWorld);
    }

    // ---- Day / night: right fist = night, open = day; no right hand keeps the current mode
    if (right?.tracked) {
      if (right.isFist) this.nightTarget = 1;
      else if (open > 0.45) this.nightTarget = 0;
    }
    this.night += (this.nightTarget - this.night) * damp(C.nightSpeed, dt);
    const day = 1 - this.night;

    // ---- Two fists held → reset
    const bothFists = !!left?.isFist && !!right?.isFist && left.tracked && right.tracked;
    if (this.wiltTimer <= 0) {
      this.resetCharge = bothFists ? this.resetCharge + dt / C.resetHold : Math.max(0, this.resetCharge - dt * 2);
      if (this.resetCharge >= 1) {
        this.wiltTimer = 0.7;
        this.resetCharge = 0;
        this.ctx.toast('Fresh garden 🌱');
      }
    }
    let wilt = 1;
    if (this.wiltTimer > 0) {
      this.wiltTimer -= dt;
      wilt = Math.max(0, this.wiltTimer / 0.7);
      this.coverage = Math.min(this.coverage, 0.18 + wilt * 0.8);
      if (this.wiltTimer <= 0) {
        this.garden.reseed();
        this.coverage = 0.18;
        wilt = 1;
      }
    }

    // ---- Lighting
    const sunPower = sunVisual * day;
    this.fallbackSun.copy(this.terrarium.position).add(this.tmp.set(1.4, 2.6, 3).multiplyScalar(Math.max(scale, 0.4)));
    const u = this.shared;
    u.uSunPos.value.copy(this.fallbackSun).lerp(this.sunWorld, sunPower);
    u.uSunColor.value.copy(MOON).lerp(new THREE.Color(C.sunColor), Math.max(sunPower, day * 0.6));
    u.uSunIntensity.value = THREE.MathUtils.lerp(0.55 * (1 - this.night * 0.35), C.sunLight, sunPower);
    u.uAmbient.value.set(C.ambientDay).lerp(new THREE.Color(C.ambientNight), this.night);
    u.uRimColor.value.setRGB(0.07, 0.06, 0.045).lerp(new THREE.Color(0.05, 0.09, 0.22), this.night);

    // Room grade: the webcam turns to blue dusk at night
    const g = this.ctx.grade;
    g.tint.setRGB(1, 1, 1).lerp(new THREE.Color(C.skyNight), this.night * 0.7);
    g.brightness = THREE.MathUtils.lerp(1 + sunPower * 0.06, 0.5, this.night);
    g.saturation = THREE.MathUtils.lerp(1, 0.7, this.night);

    // ---- Garden growth, phototropism, moss
    let sunLocal: THREE.Vector3 | null = null;
    if (sunPresence > 0.05) sunLocal = this.terrarium.worldToLocal(this.sunLocal.copy(this.sunWorld));
    const growDt = dt * (C.idleGrowth + C.growthRate * open * sunPresence * day) * (this.wiltTimer > 0 ? 0 : 1);
    this.garden.update(dt, this.time, growDt, sunLocal, sunPower, this.night, wilt);

    if (right && this.wiltTimer <= 0) {
      const d = right.palmCenter.distanceTo(this.terrarium.position) / Math.max(right.palmSize, 1e-3);
      const near = 1 - THREE.MathUtils.smoothstep(d, 1.0, C.mossReach);
      this.coverage = Math.min(1, this.coverage + dt * C.mossRate * near * sunPower);
    }
    this.moss.uniforms.uCoverage.value = this.coverage;
    this.moss.uniforms.uNight.value = this.night;

    // ---- Glass, fireflies, sun visuals
    this.glass.uniforms.uOpacity.value = C.glassOpacity * (1 + this.night * 0.3);
    this.glass.uniforms.uCharge.value = this.resetCharge;
    (this.glass.uniforms.uGlass.value as THREE.Color).set(C.glassColor);

    const fu = this.fireflyMat.uniforms;
    fu.uTime.value = this.time;
    fu.uNight.value = this.night;
    fu.uSize.value = C.fireflySize;
    fu.uObjScale.value = scale;
    fu.uRange.value = C.fireflyRange;
    fu.uPxScale.value = pointPixelScale(this.ctx.renderer, this.ctx.camera);
    (fu.uColor.value as THREE.Color).set(C.fireflyColor);

    this.sun.visible = sunVisual * day > 0.01;
    if (this.sun.visible && right) {
      const s = right.palmSize;
      const pulse = 1 + Math.sin(this.time * 2.2) * 0.04;
      const vis = sunVisual * day;
      this.sunCore.scale.setScalar(s * 0.16 * vis * pulse);
      this.sunCore.material.color.set(C.sunColor).multiplyScalar(C.sunGlow * 1.6);
      this.sunHalo.scale.setScalar(s * 1.6 * vis * pulse);
      this.sunHalo.material.color.set(C.sunColor).multiplyScalar(C.sunGlow * 0.45);
      this.sunRays.scale.setScalar(s * 4.2 * vis);
      this.sunRays.material.color.set(C.sunColor).multiplyScalar(C.sunGlow * 0.12);
      this.sunRays.material.rotation += dt * 0.1;
    }
  }

  dispose(): void {
    // Everything is under ctx.root; the manager disposes it and resets the video grade.
  }
}
