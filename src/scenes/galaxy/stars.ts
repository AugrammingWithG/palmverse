import * as THREE from 'three';
import { hash, pureAdditive } from '../../core/fx';
import { galaxyConfig as C } from './config';
import { JAR } from './jar';

/** Per-star state, mirrored in the vertex shader's branches. */
export const StarState = { Hand: 0, Jar: 1, Burst: 2, Summon: 3 } as const;

const ROTQ = /* glsl */ `vec3 rotq(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }`;

const SHARED_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uHandPos;
uniform vec4 uHandQuat;
uniform float uHandScale;
uniform float uSpin;
uniform vec3 uJarPos;
uniform vec4 uJarQuat;
uniform float uJarScale;
uniform vec3 uMouth;
uniform float uSwirl;
uniform float uArc;
uniform float uClapTime;
uniform vec3 uClapPos;
uniform float uBurst;
uniform float uReturnDelay;
uniform float uReturnTime;
uniform float uPxScale;
`;

/**
 * Thousands of stars whose positions are evaluated entirely in the vertex shader
 * from a per-star state + timestamps, so the CPU only touches a star when it
 * changes state (released, burst, summoned).
 */
export class StarField {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  readonly n: number;
  private info: Float32Array; // state, t0, slot, flight
  private start: Float32Array;
  private seeds: Float32Array;
  private infoAttr: THREE.BufferAttribute;
  private startAttr: THREE.BufferAttribute;
  private inHand: number[] = [];
  /** Stars assigned to the jar (in flight or landed), in slot order. */
  private jarStars: number[] = [];
  private landQueue: number[] = []; // landing times, ascending-ish
  landed = 0;
  private dirty = false;

  constructor(n: number) {
    this.n = n;
    this.info = new Float32Array(n * 4);
    this.start = new Float32Array(n * 3);
    this.seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) this.seeds[i] = hash(i * 0.731 + 0.1);
    for (let i = 0; i < n; i++) this.inHand.push(i);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 4));
    this.infoAttr = new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage);
    this.startAttr = new THREE.BufferAttribute(this.start, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aInfo', this.infoAttr);
    g.setAttribute('aStart', this.startAttr);

    this.material = pureAdditive(
      new THREE.ShaderMaterial({
        uniforms: {
          ...sharedUniforms(),
          uSize: { value: C.starSize },
          uColCore: { value: new THREE.Color(C.colorCore) },
          uColArm: { value: new THREE.Color(C.colorArm) },
          uColDust: { value: new THREE.Color(C.colorDust) },
          uNeb: { value: C.nebulaColors.map((c) => new THREE.Color(c)) },
        },
        vertexShader: /* glsl */ `
          ${SHARED_UNIFORMS}
          uniform float uSize;
          uniform vec3 uColCore;
          uniform vec3 uColArm;
          uniform vec3 uColDust;
          uniform vec3 uNeb[5];
          attribute vec4 aSeed;
          attribute vec4 aInfo;
          attribute vec3 aStart;
          varying vec3 vColor;
          varying float vBright;
          ${ROTQ}

          vec3 galaxyLocal() {
            float arm = floor(aSeed.x * 3.0);
            float r = pow(aSeed.y, 0.75);
            if (fract(aSeed.x * 7.13) < 0.22) r *= 0.22; // bright core bulge
            float ang = arm * 2.0944 + r * 4.4 + (aSeed.z - 0.5) * (1.1 - r * 0.6) + uTime * uSpin / (0.3 + r);
            float thick = (aSeed.w - 0.5) * 0.14 * (1.0 - r * 0.7);
            return vec3(cos(ang) * r, sin(ang) * r, thick);
          }
          vec3 handWorld() { return uHandPos + rotq(uHandQuat, galaxyLocal() * uHandScale); }

          vec3 jarWorld() {
            float slot = aInfo.z;
            float ang = aSeed.x * 6.2831 + uTime * uSwirl * (0.5 + (1.0 - slot) * 0.9) * (fract(aSeed.w * 3.7) < 0.5 ? 1.0 : 0.8);
            float r = ${(JAR.radius * 0.84).toFixed(3)} * sqrt(aSeed.y);
            float y = 0.08 + slot * 1.24 + (aSeed.z - 0.5) * 0.08 + sin(uTime * 1.3 + aSeed.x * 20.0) * 0.015;
            return uJarPos + rotq(uJarQuat, vec3(cos(ang) * r, y, sin(ang) * r) * uJarScale);
          }

          vec3 bez(vec3 a, vec3 c, vec3 b, float t) { float u = 1.0 - t; return u * u * a + 2.0 * u * t * c + t * t * b; }

          void main() {
            float state = aInfo.x;
            vec3 p;
            float bright = 1.0;
            float neb = 0.0;
            float scale = uHandScale;
            if (state < 0.5) {
              p = handWorld();
            } else if (state < 1.5) {
              float u = (uTime - aInfo.y) / aInfo.w;
              scale = uJarScale;
              if (u < 1.0) {
                u = max(u, 0.0);
                vec3 c = mix(aStart, uMouth, 0.5) + vec3(0.0, uArc * (0.25 + distance(aStart, uMouth) * 0.3), 0.0);
                p = bez(aStart, c, uMouth, u);
                bright = 2.2;
              } else {
                float s = smoothstep(0.0, 1.0, (u - 1.0) * 1.3);
                p = mix(uMouth, jarWorld(), s);
                bright = mix(2.0, 1.0, s);
              }
            } else if (state < 2.5) {
              float t = uTime - uClapTime;
              vec3 dir = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, (aSeed.z - 0.5) * 0.3) + 1e-4);
              float dist = uBurst * (0.15 + pow(aSeed.w, 0.55));
              vec3 rel = dir * dist * (1.0 - exp(-t * 2.4));
              float sw = t * 0.22 / (0.35 + dist / uBurst);
              float cs = cos(sw), sn = sin(sw);
              vec3 outP = uClapPos + vec3(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs, rel.z);
              float startT = uReturnDelay + aSeed.z * 1.6;
              float ret = smoothstep(startT, startT + uReturnTime, t);
              vec3 home = jarWorld();
              p = bez(outP, mix(outP, home, 0.5) + vec3(0.0, 0.4 * uJarScale, 0.0), home, ret);
              neb = 1.0 - ret;
              bright = 1.0 + neb * (0.6 + 1.4 * exp(-t * 1.5));
              scale = mix(uJarScale * 1.4, uJarScale, ret);
            } else {
              float u = clamp((uTime - aInfo.y) / aInfo.w, 0.0, 1.0);
              float e = u * u * (3.0 - 2.0 * u);
              vec3 a = jarWorld();
              vec3 b = handWorld();
              p = bez(a, mix(a, b, 0.5) + vec3(0.0, uArc * 0.7, 0.0), b, e);
              bright = 1.6;
            }

            float core = 1.0 - pow(aSeed.y, 0.5);
            vec3 star = mix(uColArm, uColCore, core);
            star = mix(star, uColDust, step(0.86, fract(aSeed.w * 13.7)));
            vec3 nebC = uNeb[int(floor(fract(aSeed.x * 5.3) * 4.999))];
            vColor = mix(star, nebC, neb);
            vBright = bright * (0.7 + 0.3 * sin(uTime * (2.0 + aSeed.z * 5.0) + aSeed.x * 40.0));

            vec4 mv = viewMatrix * vec4(p, 1.0);
            float size = uSize * scale * (0.45 + aSeed.w * 1.1) * (1.0 + neb * 0.6);
            gl_PointSize = max(1.0, size * uPxScale / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vBright;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float halo = smoothstep(0.5, 0.0, d);
            float core = smoothstep(0.16, 0.0, d);
            gl_FragColor = vec4(vColor * (halo * halo * 0.9 + core * 2.2) * vBright, 0.0);
          }`,
      }),
    );
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  get handCount(): number {
    return this.inHand.length;
  }
  get jarCount(): number {
    return this.jarStars.length;
  }
  get inFlight(): number {
    return this.jarStars.length - this.landed;
  }

  /** Releases up to k stars from the hand toward the jar, starting near `from`. */
  release(k: number, time: number, from: THREE.Vector3, spread: number): void {
    for (let j = 0; j < k && this.inHand.length; j++) {
      const i = this.inHand.pop()!;
      const flight = C.flightTime * (0.85 + Math.random() * 0.3);
      this.info.set([StarState.Jar, time, this.jarStars.length / this.n, flight], i * 4);
      this.start.set(
        [from.x + (Math.random() - 0.5) * spread, from.y + (Math.random() - 0.5) * spread, from.z + (Math.random() - 0.5) * spread * 0.3],
        i * 3,
      );
      this.jarStars.push(i);
      this.landQueue.push(time + flight);
      this.dirty = true;
    }
  }

  /** Bursts every landed star into the nebula. Returns how many burst. */
  burst(): number {
    let count = 0;
    for (let k = 0; k < this.landed; k++) {
      const i = this.jarStars[k];
      if (this.info[i * 4] === StarState.Jar) {
        this.info[i * 4] = StarState.Burst;
        count++;
      }
    }
    this.dirty ||= count > 0;
    return count;
  }

  /** After a burst finishes, burst stars quietly become settled jar stars again. */
  settleBurst(): void {
    for (const i of this.jarStars) {
      if (this.info[i * 4] === StarState.Burst) {
        this.info[i * 4] = StarState.Jar;
        this.info[i * 4 + 1] = -1000;
        this.dirty = true;
      }
    }
  }

  /** Calls every landed star back into the hand. */
  summon(time: number): void {
    for (const i of this.jarStars) {
      this.info.set([StarState.Summon, time + this.seeds[i * 4] * 0.7, this.info[i * 4 + 2], 1.1], i * 4);
    }
    this.dirty = true;
  }

  /** Finishes a summon: everyone is back in the hand, jar slots reset. */
  finishSummon(): void {
    for (const i of this.jarStars) {
      this.info[i * 4] = StarState.Hand;
      this.inHand.push(i);
    }
    this.jarStars = [];
    this.landQueue = [];
    this.landed = 0;
    this.dirty = true;
  }

  update(time: number): void {
    while (this.landed < this.landQueue.length && this.landQueue[this.landed] <= time) this.landed++;
    if (this.dirty) {
      this.infoAttr.needsUpdate = true;
      this.startAttr.needsUpdate = true;
      this.dirty = false;
    }
  }
}

export function sharedUniforms() {
  return {
    uTime: { value: 0 },
    uHandPos: { value: new THREE.Vector3() },
    uHandQuat: { value: new THREE.Vector4(0, 0, 0, 1) },
    uHandScale: { value: 1 },
    uSpin: { value: C.spinSpeed },
    uJarPos: { value: new THREE.Vector3() },
    uJarQuat: { value: new THREE.Vector4(0, 0, 0, 1) },
    uJarScale: { value: 1 },
    uMouth: { value: new THREE.Vector3() },
    uSwirl: { value: C.swirlSpeed },
    uArc: { value: C.arcHeight },
    uClapTime: { value: -1000 },
    uClapPos: { value: new THREE.Vector3() },
    uBurst: { value: 3 },
    uReturnDelay: { value: C.returnDelay },
    uReturnTime: { value: C.returnTime },
    uPxScale: { value: 800 },
  };
}

/** Big soft colored clouds that bloom out on a clap and fade as the stars return. */
export class Nebula {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;

  constructor(count = 46) {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i * 2.17 + 5.3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.material = pureAdditive(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uClapTime: { value: -1000 },
          uClapPos: { value: new THREE.Vector3() },
          uBurst: { value: 3 },
          uReturnDelay: { value: C.returnDelay },
          uReturnTime: { value: C.returnTime },
          uPxScale: { value: 800 },
          uGlow: { value: C.nebulaGlow },
          uNeb: { value: C.nebulaColors.map((c) => new THREE.Color(c)) },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uClapTime;
          uniform vec3 uClapPos;
          uniform float uBurst;
          uniform float uReturnDelay;
          uniform float uReturnTime;
          uniform float uPxScale;
          uniform vec3 uNeb[5];
          attribute vec4 aSeed;
          varying vec3 vColor;
          varying float vA;
          varying float vSeed;
          void main() {
            float t = uTime - uClapTime;
            vec3 dir = normalize(vec3(aSeed.x - 0.5, aSeed.y - 0.5, 0.0) + 1e-4);
            float dist = uBurst * (0.1 + 0.85 * pow(aSeed.z, 0.7));
            vec3 p = uClapPos + dir * dist * (1.0 - exp(-t * 1.6));
            p.z -= 0.5 + aSeed.w;
            float life = uReturnDelay + uReturnTime + 1.5;
            vA = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(uReturnDelay, life, t)) * step(0.0, t);
            vColor = uNeb[int(floor(aSeed.w * 4.999))];
            vSeed = aSeed.x;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float size = uBurst * (0.3 + aSeed.y * 0.45) * (0.35 + 0.65 * (1.0 - exp(-t * 1.2)));
            gl_PointSize = vA > 0.0 ? size * uPxScale / -mv.z : 0.0;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uGlow;
          uniform float uTime;
          varying vec3 vColor;
          varying float vA;
          varying float vSeed;
          float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
          }
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float n = noise(p * 3.0 + vSeed * 30.0 + uTime * 0.05) * 0.6 + noise(p * 7.0 - vSeed * 11.0) * 0.4;
            float a = smoothstep(0.5, 0.0, length(p) + (n - 0.5) * 0.35);
            gl_FragColor = vec4(vColor * a * a * vA * 0.3 * uGlow, 0.0);
          }`,
      }),
    );
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
}
