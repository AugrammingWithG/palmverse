import * as THREE from 'three';
import { HandAnchor } from '../../core/anchor';
import { createGlowTexture, damp, pointPixelScale, pureAdditive } from '../../core/fx';
import type { HandFrame } from '../../core/handTypes';
import type { Experience, SceneContext } from '../types';
import { weatherConfig as C, type WeatherMode } from './config';
import { Island, islandHeight } from './island';
import { Cloud, Lightning, Rain, Ripples, Snow, createRainbow } from './sky';

const MODES: WeatherMode[] = ['rain', 'snow', 'sunny'];
const MODE_LABEL: Record<WeatherMode, string> = { rain: 'Rain', snow: 'Snow', sunny: 'Sunny' };
const LIGHT_DIR = new THREE.Vector3(0.4, 0.8, 0.45).normalize();

export default class Weather implements Experience {
  private ctx!: SceneContext;
  private diorama = new THREE.Group();
  private island!: Island;
  private cloud!: Cloud;
  private cloudGroup = new THREE.Group();
  private rain!: Rain;
  private snow!: Snow;
  private ripples!: Ripples;
  private lightning!: Lightning;
  private rainbow!: ReturnType<typeof createRainbow>;
  private sun!: THREE.Sprite;
  private flashPlane!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private anchor!: HandAnchor;

  private time = 0;
  private cloudAmount = 0;
  private intensity = 0;
  private snowCover = 0;
  private sunny = 0;
  private flash = 0;
  private readonly cloudColor = new THREE.Color();

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    this.island = new Island();
    this.cloud = new Cloud();
    this.ripples = new Ripples();
    this.rain = new Rain(this.island, this.ripples);
    this.snow = new Snow(this.island);
    this.lightning = new Lightning();
    this.rainbow = createRainbow();
    this.rainbow.position.set(0, 0.05, -0.45);
    this.rainbow.scale.setScalar(1.05);

    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: createGlowTexture(128, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.sun.position.set(0.95, 1.75, -0.4);

    this.cloudGroup.position.y = C.cloudHeight;
    this.cloudGroup.add(this.cloud.points);
    this.diorama.add(
      this.island.group,
      this.rainbow,
      this.sun,
      this.cloudGroup,
      this.rain.mesh,
      this.snow.points,
      this.ripples.mesh,
      this.lightning.mesh,
    );
    ctx.root.add(this.diorama);

    // Full-screen additive flash, just in front of the camera
    this.flashPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      pureAdditive(new THREE.MeshBasicMaterial({ color: '#000000', depthTest: false })),
    );
    this.flashPlane.renderOrder = 100;
    ctx.root.add(this.flashPlane);

    this.anchor = new HandAnchor({
      restPosition: new THREE.Vector3(),
      restScale: C.restSize,
      scalePerPalm: C.size,
      lift: C.lift,
      follow: C.follow,
      inheritRoll: 0.3,
    });
    this.buildGui();
  }

  private buildGui(): void {
    const g = this.ctx.gui;
    g.add(C, 'mode', MODES).name('weather (W)').listen();
    g.add({ strike: () => this.strike() }, 'strike').name('⚡ lightning');
    const p = g.addFolder('Placement').close();
    p.add(C, 'size', 0.3, 2.5, 0.05).name('island size (palms)');
    p.add(C, 'lift', -1, 2, 0.01).name('lift (palms)');
    p.add(C, 'follow', 2, 40, 1).name('follow stiffness');
    p.add(C, 'viewTilt', 0, 1.2, 0.01).name('tilt toward camera');
    const s = g.addFolder('Sky');
    s.add(C, 'cloudPuffs', 4, 40, 1).name('cloud puffs');
    s.add(C, 'cloudHeight', 0.8, 2.5, 0.01).name('cloud height');
    s.add(C, 'cloudFormSpeed', 0.2, 5, 0.1).name('cloud form speed');
    s.addColor(C, 'stormCloud').name('storm cloud');
    s.add(C, 'dropSpeed', 0.5, 8, 0.1).name('rain speed');
    s.add(C, 'flakeSpeed', 0.05, 1.5, 0.01).name('snow speed');
    s.add(C, 'snowRate', 0, 0.4, 0.005).name('snow buildup');
    s.add(C, 'meltRate', 0, 0.3, 0.005).name('melt rate');
    s.add(C, 'pinchDeadzone', 0, 0.5, 0.01).name('pinch deadzone');
    const l = g.addFolder('Lightning').close();
    l.add(C, 'flickMax', 0.1, 1.2, 0.01).name('flick max (s)');
    l.addColor(C, 'boltColor').name('bolt color');
    l.add(C, 'boltGlow', 0, 15, 0.1).name('bolt glow');
    l.add(C, 'flashStrength', 0, 2, 0.05).name('screen flash');
    const w = g.addFolder('Water').close();
    w.add(C, 'waveHeight', 0, 0.12, 0.002).name('waves');
    w.addColor(C, 'waterShallow').name('shallow').onChange(() => this.island.uniforms.uShallow.value.set(C.waterShallow));
    w.addColor(C, 'waterDeep').name('deep').onChange(() => this.island.uniforms.uDeep.value.set(C.waterDeep));
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'w') return false;
    C.mode = MODES[(MODES.indexOf(C.mode) + 1) % MODES.length];
    this.ctx.toast(MODE_LABEL[C.mode]);
    return true;
  }

  private strike(): void {
    if (C.mode === 'sunny' || this.cloudAmount < 0.15) return;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.55;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.5;
    const from = new THREE.Vector3((Math.random() - 0.5) * 0.4, C.cloudHeight - 0.08, 0.05);
    const to = new THREE.Vector3(x, Math.max(0, islandHeight(x, z)), z);
    this.lightning.strike(from, to);
    this.ripples.spawn(to.x, to.y + 0.01, to.z, 3);
  }

  update(hands: HandFrame, dt: number): void {
    this.time += dt;
    const { left, right } = hands;
    const vp = this.ctx.viewport;

    // ---- Placement on the left palm (or bottom of the screen), with thunder shake
    const a = this.anchor.opts;
    a.scalePerPalm = C.size;
    a.lift = C.lift;
    a.follow = C.follow;
    a.restScale = C.restSize;
    a.restPosition.set(0, -vp.worldHeight / 2 + C.restSize * 1.0, 0);
    this.anchor.update(left, dt);
    this.anchor.apply(this.diorama);
    this.diorama.rotation.x = C.viewTilt;
    const shake = this.flash * 0.025 * this.anchor.scale;
    this.diorama.position.x += (Math.random() - 0.5) * shake;
    this.diorama.position.y += (Math.random() - 0.5) * shake;
    this.diorama.updateMatrixWorld();

    // ---- Inputs: open left hand forms the cloud, right pinch sets precipitation
    const leftOpen = left ? left.openness * left.presence : 0;
    const pinch = right ? right.pinchStrength * right.presence : 0;
    const wantRain = THREE.MathUtils.smoothstep(pinch, C.pinchDeadzone, 1);
    const sunny = C.mode === 'sunny';
    // Rain needs a cloud; pinching alone conjures a smaller one
    const cloudTarget = sunny ? 0.45 * Math.max(leftOpen, 0.6) : Math.max(leftOpen, wantRain * 0.7);
    this.cloudAmount += (cloudTarget - this.cloudAmount) * damp(C.cloudFormSpeed, dt);
    this.intensity += ((sunny ? 0 : wantRain * Math.min(1, this.cloudAmount * 1.5)) - this.intensity) * damp(4, dt);
    this.sunny += ((sunny ? 1 : 0) - this.sunny) * damp(1.5, dt);

    for (const e of hands.events) {
      if (e.type === 'pinchend' && e.side === 'right' && e.duration < C.flickMax) this.strike();
    }

    // ---- Precipitation
    const q = this.ctx.quality.particleScale;
    this.rain.update(dt, C.mode === 'rain' ? this.intensity * q : 0);
    this.snow.update(dt, this.time, C.mode === 'snow' ? this.intensity * q : 0);
    this.ripples.update(dt);
    if (C.mode === 'snow') this.snowCover = Math.min(1, this.snowCover + dt * C.snowRate * this.intensity);
    else this.snowCover = Math.max(0, this.snowCover - dt * C.meltRate * (sunny ? 2 : 1));

    // ---- Lightning flash
    this.flash = this.lightning.update(dt);

    // ---- Look
    const storm = this.intensity * (1 - this.sunny);
    const cu = this.cloud.material.uniforms;
    this.cloudGroup.position.y = C.cloudHeight;
    cu.uTime.value = this.time;
    cu.uAmount.value = this.cloudAmount;
    cu.uCount.value = C.cloudPuffs;
    cu.uObjScale.value = this.anchor.scale;
    cu.uPxScale.value = pointPixelScale(this.ctx.renderer, this.ctx.camera);
    cu.uFlash.value = this.flash;
    this.cloudColor.set(C.fairCloud).lerp(new THREE.Color(C.stormCloud), Math.min(1, storm * 1.3 + (C.mode === 'snow' ? 0.15 : 0)));
    cu.uColor.value.copy(this.cloudColor);
    (this.snow.points.material as THREE.ShaderMaterial).uniforms.uPxScale.value = cu.uPxScale.value;
    (this.snow.points.material as THREE.ShaderMaterial).uniforms.uObjScale.value = this.anchor.scale;

    const iu = this.island.uniforms;
    iu.uTime.value = this.time;
    iu.uWave.value = C.waveHeight * (1 + storm * 1.5);
    iu.uSnow.value = this.snowCover;
    iu.uFlash.value = this.flash * 1.5;
    iu.uUp.value.set(0, 1, 0).applyQuaternion(this.diorama.quaternion);
    iu.uLightDir.value.copy(LIGHT_DIR);
    iu.uLightColor.value.setRGB(1, 0.95, 0.85).multiplyScalar(1.05 - storm * 0.5 + this.sunny * 0.2);
    iu.uAmbient.value.setRGB(0.36, 0.4, 0.5).lerp(new THREE.Color(0.25, 0.28, 0.38), storm);

    this.rainbow.material.uniforms.uAmount.value = this.sunny;
    this.rainbow.visible = this.sunny > 0.01;
    this.sun.visible = this.sunny > 0.01;
    this.sun.scale.setScalar(1.5 * this.sunny);
    this.sun.material.color.setRGB(1, 0.85, 0.55).multiplyScalar(2.6 * this.sunny);

    // Flash plane covers the view; the room darkens with storms and lights up on strikes
    const cam = this.ctx.camera;
    this.flashPlane.position.set(0, 0, cam.position.z - 1);
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    this.flashPlane.scale.set(h * cam.aspect * 1.1, h * 1.1, 1);
    this.flashPlane.material.color.setRGB(0.55, 0.65, 0.85).multiplyScalar(this.flash * 0.3 * C.flashStrength);
    const g = this.ctx.grade;
    g.brightness = (1 - storm * 0.3) * (1 + this.flash * 0.8 * C.flashStrength) * (1 + this.sunny * 0.06);
    g.saturation = 1 - storm * 0.25 + this.sunny * 0.1;
    g.tint.setRGB(1, 1, 1).lerp(new THREE.Color(0.8, 0.88, 1.0), storm * 0.6).lerp(new THREE.Color(1, 0.96, 0.88), this.sunny * 0.5);
  }

  dispose(): void {
    // All meshes live under ctx.root; the manager disposes them and resets the grade.
  }
}
