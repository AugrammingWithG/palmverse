import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HandAnchor } from '../../core/anchor';
import { renderConfig } from '../../core/config';
import { createGlowTexture, damp, pointPixelScale, pureAdditive } from '../../core/fx';
import type { HandFrame } from '../../core/handTypes';
import type { Experience, SceneContext } from '../types';
import { galaxyConfig as C } from './config';
import { JAR, Jar } from './jar';
import { Nebula, StarField } from './stars';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Quaternion();

export default class Galaxy implements Experience {
  private ctx!: SceneContext;
  private jar!: Jar;
  private jarAnchor!: HandAnchor;
  private stars!: StarField;
  private nebula!: Nebula;
  private shock!: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private coreGlow!: THREE.Sprite;
  private jarHalo!: THREE.Sprite;

  private time = 0;
  private pourAccum = 0;
  private pour = 0;
  private fill = 0;
  private burstEnd = -1;
  private summonEnd = -1;
  private flash = 0;
  private clapTime = -1000;
  private fistHeld = 0;
  private readonly galaxyPos = new THREE.Vector3();
  private readonly galaxyQuat = new THREE.Quaternion();
  private galaxyScale = 1;
  private galaxyInit = false;
  private readonly mouth = new THREE.Vector3();

  init(ctx: SceneContext): void {
    this.ctx = ctx;

    // Reflections for the glass
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    ctx.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(2, 3, 5);
    ctx.root.add(new THREE.AmbientLight('#ffffff', 0.4), key);

    this.jar = new Jar(ctx.video);
    ctx.root.add(this.jar.group);
    this.jarAnchor = new HandAnchor({
      restPosition: new THREE.Vector3(),
      restScale: C.restSize,
      scalePerPalm: C.jarSize,
      lift: C.jarLift,
      follow: C.follow,
      inheritRoll: 0.25,
    });

    this.stars = new StarField(Math.round(C.starCount * Math.max(0.4, ctx.quality.particleScale)));
    // Nebula puffs are screen-sized: keep the count modest, fewer still on weaker devices
    this.nebula = new Nebula(Math.round(30 * Math.max(0.5, ctx.quality.particleScale)));
    const glowTex = createGlowTexture(128, 1.6);
    const sprite = () =>
      new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.coreGlow = sprite();
    this.jarHalo = sprite();
    this.jarHalo.renderOrder = 0;
    this.shock = new THREE.Mesh(
      new THREE.RingGeometry(0.975, 1, 128),
      pureAdditive(new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide })),
    );
    ctx.root.add(this.jarHalo, this.nebula.points, this.coreGlow, this.stars.points, this.shock);

    this.buildGui();
  }

  private buildGui(): void {
    const g = this.ctx.gui;
    g.add({ fill: () => this.instantFill() }, 'fill').name('✨ fill jar');
    g.add({ burst: () => this.burst() }, 'burst').name('💥 burst (clap)');
    g.add({ summon: () => this.summon() }, 'summon').name('↩ summon stars back');
    const s = g.addFolder('Stars');
    s.add(C, 'starSize', 0.005, 0.12, 0.001).name('star size');
    s.add(C, 'galaxyRadius', 0.2, 2, 0.01).name('galaxy radius (palms)');
    s.add(C, 'galaxyLift', -0.5, 1.5, 0.01).name('galaxy lift (palms)');
    s.add(C, 'spinSpeed', 0, 3, 0.05).name('spin');
    s.addColor(C, 'colorCore').name('core');
    s.addColor(C, 'colorArm').name('arms');
    s.addColor(C, 'colorDust').name('dust');
    const p = g.addFolder('Pouring');
    p.add(C, 'pourStart', 0, 1, 0.01).name('pour starts at');
    p.add(C, 'pourFull', 0.1, 1, 0.01).name('full pour at');
    p.add(C, 'pourRate', 50, 5000, 10).name('stars / second');
    p.add(C, 'flightTime', 0.2, 2.5, 0.05).name('flight time');
    p.add(C, 'arcHeight', 0, 3, 0.05).name('arc height');
    const j = g.addFolder('Jar').close();
    j.add(C, 'jarSize', 0.3, 2.5, 0.05).name('jar size (palms)');
    j.add(C, 'jarLift', -1, 1, 0.01).name('jar lift (palms)');
    j.add(C, 'fillGlow', 0, 6, 0.05).name('fill glow');
    j.add(C, 'swirlSpeed', 0, 3, 0.05).name('swirl');
    j.add(C, 'ior', 1, 2.3, 0.01).onChange(() => (this.jar.glass.ior = C.ior));
    j.add(C, 'thickness', 0, 2, 0.01).onChange(() => (this.jar.glass.thickness = C.thickness));
    const b = g.addFolder('Clap burst').close();
    b.add(C, 'burstRadius', 0.1, 1.5, 0.01).name('burst size (screens)');
    b.add(C, 'returnDelay', 0, 8, 0.1).name('return delay (s)');
    b.add(C, 'returnTime', 0.5, 8, 0.1).name('return time (s)');
    b.add(C, 'nebulaGlow', 0, 4, 0.05).name('nebula glow');
  }

  private instantFill(): void {
    this.stars.release(this.stars.handCount, this.time - 10, this.mouth, 0.05);
  }

  private burst(): void {
    if (this.burstEnd > 0 || this.summonEnd > 0 || this.stars.landed < this.stars.n * 0.02) return;
    if (this.stars.burst() === 0) return;
    this.clapTime = this.time;
    this.burstEnd = this.time + C.returnDelay + 1.6 + C.returnTime + 0.3;
    this.flash = 1;
  }

  private summon(): void {
    if (this.burstEnd > 0 || this.summonEnd > 0 || this.stars.jarCount === 0 || this.stars.inFlight > 0) return;
    this.stars.summon(this.time);
    this.summonEnd = this.time + 2.0;
  }

  update(hands: HandFrame, dt: number): void {
    this.time += dt;
    const { left, right } = hands;
    const vp = this.ctx.viewport;

    // ---- Jar in the left hand
    const a = this.jarAnchor.opts;
    a.scalePerPalm = C.jarSize;
    a.lift = C.jarLift;
    a.restScale = C.restSize;
    a.restPosition.set(-vp.worldWidth * 0.18, -vp.worldHeight / 2 + 0.35, 0);
    this.jarAnchor.update(left, dt);
    this.jarAnchor.apply(this.jar.group);
    this.jar.group.rotation.x = 0.18; // peek into the mouth
    this.jar.group.updateMatrixWorld();
    const jarScale = this.jarAnchor.scale;
    this.mouth.set(0, JAR.mouthY, 0).applyMatrix4(this.jar.group.matrixWorld);

    // ---- Galaxy hovering over the right palm
    const held = !!right && right.presence > 0.05;
    let targetScale: number;
    if (held) {
      _target.copy(right!.palmCenter).addScaledVector(right!.palmNormal, right!.palmSize * C.galaxyLift);
      _q.copy(right!.palmQuaternion);
      targetScale = right!.palmSize * C.galaxyRadius;
    } else {
      _target.set(vp.worldWidth * 0.2, vp.worldHeight * 0.08, 0);
      _q.identity();
      targetScale = C.restSize * C.galaxyRadius;
    }
    if (!this.galaxyInit) {
      this.galaxyPos.copy(_target);
      this.galaxyQuat.copy(_q);
      this.galaxyScale = targetScale;
      this.galaxyInit = true;
    }
    this.galaxyPos.lerp(_target, damp(held ? C.follow : 2.5, dt));
    this.galaxyQuat.slerp(_q, damp(held ? 14 : 2, dt));
    this.galaxyScale += (targetScale - this.galaxyScale) * damp(8, dt);

    // ---- Pour: tip the right palm toward the jar (palm normal turning toward / down at the jar)
    _dir.subVectors(this.mouth, this.galaxyPos);
    _dir.z = 0;
    _dir.normalize();
    _target.set(_dir.x * 0.8, _dir.y * 0.8 - 0.6, 0).normalize();
    const pourDot = held && right!.tracked ? right!.palmNormal.dot(_target) : 0;
    const pourTarget = THREE.MathUtils.smoothstep(pourDot, C.pourStart, C.pourFull) * (held ? right!.presence : 0);
    this.pour += (pourTarget - this.pour) * damp(10, dt);
    if (this.summonEnd < 0 && this.pour > 0.02 && this.stars.handCount > 0) {
      this.pourAccum += this.pour * C.pourRate * Math.max(0.4, this.ctx.quality.particleScale) * dt;
      const k = Math.floor(this.pourAccum);
      this.pourAccum -= k;
      _v.copy(this.galaxyPos).addScaledVector(_dir, this.galaxyScale * 0.75);
      this.stars.release(k, this.time, _v, this.galaxyScale * 0.25);
    }

    // ---- Clap → nebula burst; right fist (empty hand) → summon the stars back
    for (const e of hands.events) if (e.type === 'clap') this.burst();
    if (this.burstEnd > 0 && this.time > this.burstEnd) {
      this.stars.settleBurst();
      this.burstEnd = -1;
    }
    this.fistHeld = right?.isFist ? this.fistHeld + dt : 0;
    if (this.fistHeld > 0.6 && this.stars.handCount < this.stars.n * 0.1) this.summon();
    if (this.summonEnd > 0 && this.time > this.summonEnd) {
      this.stars.finishSummon();
      this.summonEnd = -1;
    }
    this.stars.update(this.time);

    // ---- Uniforms shared by stars + nebula
    const burstR = Math.max(vp.worldWidth, vp.worldHeight) * C.burstRadius;
    const clapPos = _v.set(0, JAR.height * 0.5, 0).applyMatrix4(this.jar.group.matrixWorld);
    const px = pointPixelScale(this.ctx.renderer, this.ctx.camera);
    const su = this.stars.material.uniforms;
    su.uTime.value = this.time;
    su.uHandPos.value.copy(this.galaxyPos);
    su.uHandQuat.value.set(this.galaxyQuat.x, this.galaxyQuat.y, this.galaxyQuat.z, this.galaxyQuat.w);
    su.uHandScale.value = this.galaxyScale;
    su.uSpin.value = C.spinSpeed;
    su.uJarPos.value.copy(this.jar.group.position);
    this.jar.group.getWorldQuaternion(_q);
    su.uJarQuat.value.set(_q.x, _q.y, _q.z, _q.w);
    su.uJarScale.value = jarScale;
    su.uMouth.value.copy(this.mouth);
    su.uSwirl.value = C.swirlSpeed;
    su.uArc.value = C.arcHeight * jarScale;
    su.uClapTime.value = this.clapTime;
    if (this.time - this.clapTime < 0.05) su.uClapPos.value.copy(clapPos);
    su.uBurst.value = burstR;
    su.uReturnDelay.value = C.returnDelay;
    su.uReturnTime.value = C.returnTime;
    su.uPxScale.value = px;
    su.uSize.value = C.starSize;
    su.uColCore.value.set(C.colorCore);
    su.uColArm.value.set(C.colorArm);
    su.uColDust.value.set(C.colorDust);
    const nu = this.nebula.material.uniforms;
    nu.uTime.value = this.time;
    nu.uClapTime.value = this.clapTime;
    nu.uClapPos.value.copy(su.uClapPos.value);
    nu.uBurst.value = burstR;
    nu.uReturnDelay.value = C.returnDelay;
    nu.uReturnTime.value = C.returnTime;
    nu.uPxScale.value = px;
    nu.uGlow.value = C.nebulaGlow;

    // ---- Jar fills and glows
    this.fill += (this.stars.landed / this.stars.n - this.fill) * damp(3, dt);
    const gu = this.jar.glow.uniforms;
    gu.uFill.value = this.fill;
    gu.uTime.value = this.time;
    gu.uColorA.value.set(C.colorArm);
    gu.uColorB.value.set(C.colorCore);
    gu.uGlow.value = C.fillGlow;
    this.jar.light.intensity = this.fill * C.fillGlow * 1.5;
    this.jar.light.distance = jarScale * 3;
    this.jar.glass.emissive.set(C.colorCore).multiplyScalar(this.fill * 0.05);
    const room = this.jar.glass.userData.room;
    room.uHasVideo.value = this.ctx.video.hasVideo() ? 1 : 0;
    room.uVideoGain.value = renderConfig.videoBrightness * this.ctx.grade.brightness;

    this.jarHalo.position.copy(clapPos);
    this.jarHalo.position.z -= 0.3;
    this.jarHalo.scale.setScalar(jarScale * (1.2 + this.fill * 2.2));
    this.jarHalo.material.color.set(C.colorArm).multiplyScalar(this.fill * 0.45);

    const inHand = this.stars.handCount / this.stars.n;
    this.coreGlow.position.copy(this.galaxyPos);
    this.coreGlow.scale.setScalar(this.galaxyScale * (0.6 + inHand * 1.2));
    this.coreGlow.material.color.set(C.colorCore).multiplyScalar(0.35 + inHand * 0.9);

    // ---- Shockwave + flash on burst
    const st = this.time - this.clapTime;
    this.shock.visible = st < 0.9;
    if (this.shock.visible) {
      const e = 1 - Math.pow(1 - st / 0.9, 3);
      this.shock.position.copy(su.uClapPos.value);
      this.shock.scale.setScalar(0.2 + e * burstR * 0.9);
      this.shock.material.color.set('#fff0ff').multiplyScalar(1.2 * Math.pow(1 - st / 0.9, 2));
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const g = this.ctx.grade;
    g.brightness = 0.82 + this.flash * 0.5;
    g.saturation = 0.9;
    g.tint.setRGB(0.92, 0.94, 1.0);
  }

  dispose(): void {
    // Meshes, lights and the environment map are cleaned up by the scene manager.
  }
}
