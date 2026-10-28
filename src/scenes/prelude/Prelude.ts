import * as THREE from 'three';
import { createGlowTexture, damp, hash, litUniforms, pointPixelScale, pureAdditive } from '../../core/fx';
import type { HandFrame } from '../../core/handTypes';
import { Garden } from '../palm-terrarium/garden';
import type { Experience, SceneContext } from '../types';
import { preludeConfig as C } from './config';

const MAX_GARDENS = 12;
const MAX_MOTES = 260;
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Night sky with a teal clearing glow, drifting haze and twinkling stars. Drawn first, fully opaque. */
function backdropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uFade: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAspect;
      uniform float uFade;
      varying vec2 vUv;

      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        vec2 uv = vUv;
        vec3 col = mix(vec3(0.012, 0.02, 0.018), vec3(0.003, 0.005, 0.006), smoothstep(0.0, 0.85, uv.y));

        // The clearing: a low teal glow with slow haze moving through it
        vec2 p = (uv - vec2(0.5, 0.16)) * vec2(uAspect, 1.7);
        float clearing = exp(-dot(p, p) * 1.6);
        float haze = fbm(vec2(uv.x * uAspect * 2.2 + uTime * 0.025, uv.y * 3.0 - uTime * 0.012));
        col += vec3(0.03, 0.15, 0.15) * clearing * (0.45 + haze * 0.9);
        col += vec3(0.05, 0.03, 0.07) * exp(-dot(p - vec2(0.0, 0.9), p - vec2(0.0, 0.9)) * 0.5) * 0.5;

        // Stars in the upper sky
        vec2 g = uv * vec2(uAspect, 1.0) * 70.0;
        vec2 id = floor(g);
        float r = h21(id);
        if (r > 0.975) {
          vec2 c = vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5;
          float d = length(fract(g) - 0.5 - c * 0.6);
          float tw = 0.45 + 0.55 * sin(uTime * (0.8 + r * 3.0) + r * 60.0);
          col += vec3(0.78, 0.86, 1.0) * smoothstep(0.11, 0.0, d) * tw * smoothstep(0.3, 0.95, uv.y) * 0.8;
        }
        gl_FragColor = vec4(col * uFade, 1.0);
      }`,
  });
}

/** Fireflies over the meadow and slow starlight dust rising through the frame. */
function moteMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uTime: { value: 0 },
        uPx: { value: 1 },
        uHalfW: { value: 6 },
        uBottom: { value: -3.6 },
        uHeight: { value: 7.3 },
        uFade: { value: 0 },
        uFirefly: { value: new THREE.Color(C.fireflyColor) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uPx, uHalfW, uBottom, uHeight, uFade;
        varying float vA;
        varying float vKind;
        void main() {
          vec3 p;
          float size;
          float t = uTime;
          vKind = step(0.45, aSeed.w);
          if (vKind < 0.5) {
            p.x = (aSeed.x * 2.0 - 1.0) * uHalfW + sin(t * 0.3 + aSeed.y * 20.0) * 0.6;
            p.y = uBottom + 0.3 + aSeed.y * aSeed.y * 3.2 + sin(t * 0.5 + aSeed.z * 30.0) * 0.3;
            p.z = -1.5 + aSeed.z * 3.2 + cos(t * 0.4 + aSeed.x * 17.0) * 0.4;
            vA = pow(0.5 + 0.5 * sin(t * (0.7 + aSeed.w * 2.0) + aSeed.x * 50.0), 3.0);
            size = 0.1;
          } else {
            float h = fract(aSeed.y + t * 0.01 * (0.4 + aSeed.z));
            p.x = (aSeed.x * 2.0 - 1.0) * uHalfW * 1.15 + sin(t * 0.2 + aSeed.z * 9.0) * 0.3;
            p.y = uBottom + h * uHeight * 1.1;
            p.z = -3.5 + aSeed.z * 4.0;
            vA = sin(h * 3.14159) * (0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * 1.6 + aSeed.w * 80.0), 2.0)) * 0.7;
            size = 0.04;
          }
          vA *= uFade;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec3 uFirefly;
        varying float vA;
        varying float vKind;
        void main() {
          vec3 c = mix(uFirefly * 1.6, vec3(0.85, 0.92, 1.0), vKind);
          gl_FragColor = vec4(c * texture2D(uTex, gl_PointCoord).a * vA, 0.0);
        }`,
    }),
  );
}

interface Bed {
  holder: THREE.Group;
  garden: Garden;
  /** Seconds after load before this bed starts to sprout. */
  start: number;
  /** Resting height; the bed sinks below the edge on exit. */
  baseY: number;
}

/**
 * Landing backdrop: a night meadow of terrarium flowers along the bottom edge.
 * The pointer is a small sun: flowers lean toward it and light up as it passes.
 */
export default class Prelude implements Experience {
  private ctx!: SceneContext;
  private shared = litUniforms();
  private beds: Bed[] = [];
  private backdrop!: THREE.ShaderMaterial;
  private motes!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private orb = new THREE.Group();
  private halo!: THREE.Sprite;
  private core!: THREE.Sprite;
  private time = 0;
  private fade = 0;
  private leaving = -1;
  private leaveResolve: (() => void) | null = null;
  private pointer = new THREE.Vector2(-1, -1);
  private lastMove = -100;
  private sun = new THREE.Vector3(0, 0, C.sunDepth);
  private target = new THREE.Vector3();
  private sunLocal = new THREE.Vector3();
  private readonly abort = new AbortController();

  init(ctx: SceneContext): void {
    this.ctx = ctx;

    this.backdrop = backdropMaterial();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdrop);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    ctx.root.add(sky);

    const glow = createGlowTexture(128, 2);
    const seeds = new Float32Array(MAX_MOTES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i * 1.37 + 0.5);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MOTES * 3), 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.motes = new THREE.Points(mg, moteMaterial(glow));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 5;
    ctx.root.add(this.motes);

    // The sky is opaque, so ordinary additive blending (which also adds alpha) is safe here
    const sprite = (opacity: number) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow,
          color: new THREE.Color(C.sunColor).multiplyScalar(opacity),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
    this.halo = sprite(0.5);
    this.core = sprite(2.4);
    this.orb.add(this.halo, this.core);
    this.orb.renderOrder = 6;
    ctx.root.add(this.orb);

    const s = this.shared;
    s.uSunColor.value.set(C.sunColor);
    s.uAmbient.value.set(C.ambient);
    s.uRimColor.value.set(C.rim);

    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'pointermove',
      (e) => {
        this.pointer.set(e.clientX, e.clientY);
        this.lastMove = this.time;
      },
      opts,
    );
    document.addEventListener('pointerleave', () => (this.lastMove = -100), opts);

    this.layout();
    this.applyQuality();

    const g = ctx.gui;
    g.add(C, 'growRate', 0, 1, 0.01).name('grow rate');
    g.add(C, 'lean', 0, 1, 0.01).name('lean to cursor');
    g.add(C, 'petalGlow', 0, 1.5, 0.01).name('petal glow');
    g.add(C, 'sunLight', 0, 8, 0.1).name('cursor light');
    g.add({ regrow: () => this.layout(true) }, 'regrow').name('↺ regrow meadow');
  }

  /** Spread flower beds along the bottom edge: small in the middle (under the title), tall at the sides. */
  private layout(regrow = false): void {
    const vp = this.ctx.viewport;
    const n = Math.min(MAX_GARDENS, Math.max(4, Math.round(vp.worldWidth / C.spacing)));
    while (this.beds.length < n) {
      const i = this.beds.length;
      const garden = new Garden(this.shared as unknown as Record<string, THREE.IUniform>);
      for (let k = 0; k < i; k++) garden.reseed(); // each bed gets its own seed
      const holder = new THREE.Group();
      holder.add(garden.group);
      this.ctx.root.add(holder);
      this.beds.push({ holder, garden, start: 0, baseY: 0 });
    }
    const bottom = -vp.worldHeight / 2;
    this.beds.forEach((bed, i) => {
      bed.holder.visible = i < n;
      if (i >= n) return;
      const t = (i + 0.5) / n;
      const edge = Math.abs(t - 0.5) * 2;
      const scale = C.bedScale * (0.62 + edge * edge * 0.75) * (0.9 + hash(i * 7.1) * 0.2);
      const z = -1.6 + hash(i * 3.3) * 2.4;
      // Account for perspective so beds still span the visible width at depth z
      const widthAtZ = vp.worldWidth * ((vp.cameraDistance - z) / vp.cameraDistance);
      bed.baseY = bottom - 0.12 * scale;
      bed.holder.position.set((t - 0.5) * widthAtZ * 1.02 + (hash(i * 5.9) - 0.5) * 0.3, bed.baseY, z);
      bed.holder.scale.setScalar(scale);
      bed.holder.rotation.set(0.22, hash(i * 9.4) * Math.PI * 2, 0);
      bed.holder.updateMatrixWorld(true);
      bed.start = (regrow ? 0 : 0.35) + (1 - edge) * 0.5 + hash(i * 2.2) * 0.5;
      if (regrow) bed.garden.reseed();
    });
    if (regrow) this.time = Math.min(this.time, 0.35);
  }

  private applyQuality(): void {
    this.motes.geometry.setDrawRange(0, Math.round(MAX_MOTES * Math.max(0.4, this.ctx.quality.particleScale)));
  }

  onQualityChange(): void {
    this.applyQuality();
  }

  onResize(): void {
    this.layout();
  }

  outro(): Promise<void> {
    if (this.leaving >= 0) return Promise.resolve();
    this.leaving = 0;
    return new Promise((resolve) => (this.leaveResolve = resolve));
  }

  update(_hands: HandFrame, dt: number): void {
    this.time += dt;
    const vp = this.ctx.viewport;

    let wilt = 1;
    if (this.leaving >= 0) {
      this.leaving += dt / C.outroTime;
      wilt = Math.max(0, 1 - this.leaving * 1.4);
      this.fade = Math.max(0, 1 - this.leaving);
      if (this.leaving >= 1 && this.leaveResolve) {
        this.leaveResolve();
        this.leaveResolve = null;
      }
    } else {
      this.fade = Math.min(1, this.fade + dt / 1.4);
    }

    // ---- The pointer is the sun; with no recent pointer it drifts on its own
    const idle = this.time - this.lastMove > C.idleAfter || this.pointer.x < 0;
    let px: number;
    let py: number;
    if (idle) {
      px = vp.width * (0.5 + 0.3 * Math.sin(this.time * 0.21 + 1.2));
      py = vp.height * (vp.width < vp.height ? 0.72 : 0.62) + vp.height * 0.06 * Math.sin(this.time * 0.37);
    } else {
      px = this.pointer.x;
      py = this.pointer.y;
    }
    const cam = this.ctx.camera;
    _v.set((px / vp.width) * 2 - 1, -(py / vp.height) * 2 + 1, 0.5).unproject(cam);
    _dir.copy(_v).sub(cam.position).normalize();
    this.target.copy(cam.position).addScaledVector(_dir, (C.sunDepth - cam.position.z) / _dir.z);
    this.sun.lerp(this.target, damp(idle ? 1.5 : 7, dt));

    const pulse = 1 + Math.sin(this.time * 2.1) * 0.05;
    this.orb.position.copy(this.sun);
    this.halo.scale.setScalar(C.orbSize * 4 * pulse * this.fade);
    this.core.scale.setScalar(C.orbSize * pulse * this.fade);

    const s = this.shared;
    s.uSunPos.value.copy(this.sun);
    s.uSunIntensity.value = C.sunLight * this.fade;

    // ---- Meadow
    for (const bed of this.beds) {
      if (!bed.holder.visible) continue;
      if (this.leaving >= 0) {
        bed.holder.position.y = bed.baseY - (1 - wilt) * bed.holder.scale.y * 1.1;
        bed.holder.updateMatrixWorld(true);
      }
      const growDt = this.time > bed.start ? dt * C.growRate : 0;
      bed.holder.worldToLocal(this.sunLocal.copy(this.sun));
      bed.garden.update(dt, this.time, growDt, this.sunLocal, C.lean, C.night, wilt);
      bed.garden.setPetalGlow(C.petalGlow * this.fade);
    }

    // ---- Sky and motes
    const b = this.backdrop.uniforms;
    b.uTime.value = this.time;
    b.uAspect.value = vp.width / vp.height;
    b.uFade.value = this.fade;
    const m = this.motes.material.uniforms;
    m.uTime.value = this.time;
    m.uPx.value = pointPixelScale(this.ctx.renderer, cam);
    m.uHalfW.value = vp.worldWidth / 2;
    m.uBottom.value = -vp.worldHeight / 2;
    m.uHeight.value = vp.worldHeight;
    m.uFade.value = this.fade;
  }

  dispose(): void {
    this.abort.abort();
    this.leaveResolve?.();
  }
}
