import * as THREE from 'three';
import { hash, pureAdditive } from '../../core/fx';
import { weatherConfig as C } from './config';
import type { Island } from './island';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Soft cloud built from fluffy point sprites; forms (grows) with `amount`. */
export class Cloud {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  readonly count = 40;

  constructor() {
    const pos = new Float32Array(this.count * 3);
    const seed = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      const a = hash(i * 3.1) * Math.PI * 2;
      const r = Math.sqrt(hash(i * 5.7)) * 0.62;
      pos.set([Math.cos(a) * r * 1.15, (hash(i * 9.3) - 0.35) * 0.22, Math.sin(a) * r * 0.6], i * 3);
      seed.set([hash(i * 1.9), 0.35 + hash(i * 7.7) * 0.3], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uPxScale: { value: 800 },
        uObjScale: { value: 1 },
        uColor: { value: new THREE.Color() },
        uFlash: { value: 0 },
        uCount: { value: 22 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmount;
        uniform float uPxScale;
        uniform float uObjScale;
        uniform float uCount;
        attribute vec2 aSeed;
        varying float vSeed;
        varying float vShade;
        void main() {
          vSeed = aSeed.x;
          vec3 p = position;
          p.x += sin(uTime * 0.25 + aSeed.x * 20.0) * 0.05;
          p.y += sin(uTime * 0.4 + aSeed.x * 11.0) * 0.02;
          // Puffs beyond the configured count stay hidden; the rest grow in one after another
          float idx = float(gl_VertexID);
          float grow = clamp(uAmount * 1.6 - aSeed.x * 0.6, 0.0, 1.0) * step(idx, uCount - 0.5);
          p *= 0.55 + 0.45 * grow;
          vShade = clamp(0.5 + p.y * 2.5, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSeed.y * grow * uObjScale * uPxScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFlash;
        uniform float uTime;
        varying float vSeed;
        varying float vShade;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float n = noise(p * 4.0 + vSeed * 17.0 + uTime * 0.08) * 0.6 + noise(p * 9.0 - vSeed * 5.0) * 0.4;
          float a = smoothstep(0.5, 0.22, length(p) + (n - 0.5) * 0.3);
          float top = 1.0 - gl_PointCoord.y;
          vec3 col = uColor * mix(0.62, 1.12, top * 0.6 + vShade * 0.4);
          col += vec3(0.75, 0.85, 1.0) * uFlash * 2.5;
          gl_FragColor = vec4(col, a * 0.92);
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
}

interface Drop {
  x: number;
  y: number;
  z: number;
  v: number;
}

/** Raindrop streaks (instanced) that fall from the cloud and splash on island or water. */
export class Rain {
  readonly mesh: THREE.InstancedMesh;
  private drops: Drop[];
  active = 0;

  constructor(private island: Island, private ripples: Ripples) {
    const geo = new THREE.PlaneGeometry(0.007, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: '#d6ecff', transparent: true, opacity: 0.6, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, C.maxDrops);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops = Array.from({ length: C.maxDrops }, () => ({ x: 0, y: -10, z: 0, v: 0 }));
    for (const d of this.drops) this.respawn(d, true);
  }

  private respawn(d: Drop, scatter = false): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.7;
    d.x = Math.cos(a) * r * 1.1;
    d.z = Math.sin(a) * r * 0.6;
    d.y = C.cloudHeight - 0.12 - (scatter ? Math.random() * C.cloudHeight : Math.random() * 0.15);
    d.v = C.dropSpeed * (0.85 + Math.random() * 0.3);
  }

  update(dt: number, intensity: number): void {
    const target = Math.round(C.maxDrops * intensity);
    // Ramp the active count so rain starts from the cloud instead of popping in mid-air
    if (target > this.active) {
      for (let i = this.active; i < target; i++) this.respawn(this.drops[i]);
    }
    this.active = target;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.active; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      const s = this.island.surfaceAt(d.x, d.z);
      if (d.y < s.y) {
        if (Math.random() < 0.35) this.ripples.spawn(d.x, s.y + 0.005, d.z, s.water ? 1 : 0.5);
        this.respawn(d);
      }
      _m.makeTranslation(d.x, d.y, d.z);
      _m.toArray(arr, i * 16);
    }
    this.mesh.count = this.active;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Snowflakes drift down with a wobble. */
export class Snow {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private seeds: Float32Array;
  active = 0;

  constructor(private island: Island) {
    this.pos = new Float32Array(C.maxFlakes * 3);
    this.seeds = new Float32Array(C.maxFlakes);
    for (let i = 0; i < C.maxFlakes; i++) {
      this.seeds[i] = Math.random();
      this.respawn(i, true);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPxScale: { value: 800 }, uObjScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uPxScale;
        uniform float uObjScale;
        attribute float aSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (0.025 + aSeed * 0.03) * uObjScale * uPxScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.15, d) * 0.95);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  private respawn(i: number, scatter = false): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.75;
    this.pos[i * 3] = Math.cos(a) * r * 1.1;
    this.pos[i * 3 + 1] = C.cloudHeight - 0.1 - (scatter ? Math.random() * C.cloudHeight : Math.random() * 0.1);
    this.pos[i * 3 + 2] = Math.sin(a) * r * 0.6;
  }

  update(dt: number, time: number, intensity: number): void {
    const target = Math.round(C.maxFlakes * intensity);
    for (let i = this.active; i < target; i++) this.respawn(i);
    this.active = target;
    for (let i = 0; i < this.active; i++) {
      const k = i * 3;
      const s = this.seeds[i];
      this.pos[k] += Math.sin(time * (1 + s) + s * 30) * 0.12 * dt;
      this.pos[k + 1] -= C.flakeSpeed * (0.7 + s * 0.6) * dt;
      this.pos[k + 2] += Math.cos(time * (0.8 + s) + s * 17) * 0.06 * dt;
      if (this.pos[k + 1] < this.island.surfaceAt(this.pos[k], this.pos[k + 2]).y) this.respawn(i);
    }
    this.points.geometry.setDrawRange(0, this.active);
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Expanding rings where drops land. */
export class Ripples {
  readonly mesh: THREE.InstancedMesh;
  private age: Float32Array;
  private strength: Float32Array;
  private pos: Float32Array;
  private next = 0;
  readonly capacity = 70;

  constructor() {
    const geo = new THREE.RingGeometry(0.75, 1, 20, 1).rotateX(-Math.PI / 2);
    const mat = pureAdditive(new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    this.mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.age = new Float32Array(this.capacity).fill(10);
    this.strength = new Float32Array(this.capacity);
    this.pos = new Float32Array(this.capacity * 3);
    for (let i = 0; i < this.capacity; i++) this.mesh.setColorAt(i, _c.setRGB(0, 0, 0));
  }

  spawn(x: number, y: number, z: number, strength: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([x, y, z], i * 3);
    this.age[i] = 0;
    this.strength[i] = strength;
  }

  update(dt: number): void {
    const life = 0.55;
    for (let i = 0; i < this.capacity; i++) {
      this.age[i] += dt;
      const t = this.age[i] / life;
      if (t >= 1) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      const s = (0.015 + t * 0.07) * this.strength[i];
      _m.makeScale(s, s, s).setPosition(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(0.75, 0.9, 1).multiplyScalar((1 - t) * 0.9));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Procedural branching bolt as camera-facing ribbons, plus flash timing. */
export class Lightning {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private age = 10;
  private readonly life = 0.5;

  constructor() {
    this.material = pureAdditive(
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 } },
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          attribute float aEdge;
          attribute float aWidth;
          varying float vEdge;
          varying float vWidth;
          void main() {
            vEdge = aEdge;
            vWidth = aWidth;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying float vEdge;
          varying float vWidth;
          void main() {
            float core = pow(1.0 - abs(vEdge), 2.0);
            vec3 c = mix(uColor, vec3(1.0), core * core) * core * uIntensity * (0.4 + vWidth);
            gl_FragColor = vec4(c, 0.0);
          }`,
      }),
    );
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  strike(from: THREE.Vector3, to: THREE.Vector3): void {
    const segs: [THREE.Vector3, THREE.Vector3, number][] = [];
    const build = (a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number) => {
      let pts = [a.clone(), b.clone()];
      const len = a.distanceTo(b);
      for (let it = 0; it < 6; it++) {
        const next: THREE.Vector3[] = [pts[0]];
        const amp = len * 0.22 / Math.pow(1.8, it);
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1];
          const m = p.clone().lerp(q, 0.5);
          const dir = q.clone().sub(p);
          const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
          m.addScaledVector(perp, (Math.random() - 0.5) * 2 * amp);
          m.z += (Math.random() - 0.5) * amp * 0.5;
          next.push(m, q);
          if (depth > 0 && it >= 2 && Math.random() < 0.12) {
            const bd = dir.clone().normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), (Math.random() - 0.5) * 1.6);
            build(m, m.clone().addScaledVector(bd, len * (0.15 + Math.random() * 0.25)), width * 0.45, depth - 1);
          }
        }
        pts = next;
      }
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], width * (1 - (i / pts.length) * 0.5)]);
    };
    build(from, to, 1, 2);

    const pos: number[] = [];
    const edge: number[] = [];
    const widthAttr: number[] = [];
    const W = 0.035;
    for (const [p, q, w] of segs) {
      const d = q.clone().sub(p);
      const n = new THREE.Vector3(-d.y, d.x, 0).normalize().multiplyScalar(W * w);
      const a = p.clone().add(n), b = p.clone().sub(n), c = q.clone().add(n), e = q.clone().sub(n);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, e.x, e.y, e.z, c.x, c.y, c.z);
      edge.push(1, -1, 1, -1, -1, 1);
      for (let k = 0; k < 6; k++) widthAttr.push(w);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setAttribute('aWidth', new THREE.Float32BufferAttribute(widthAttr, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.age = 0;
  }

  /** Returns the flash intensity (0..1) for lighting and screen flash. */
  update(dt: number): number {
    this.age += dt;
    const t = this.age;
    // Strike, dim, restrike, fade
    const flash = t > this.life ? 0 : t < 0.07 ? 1 : t < 0.13 ? 0.25 : t < 0.2 ? 0.85 : Math.max(0, 1 - (t - 0.2) / (this.life - 0.2)) * 0.6;
    this.mesh.visible = flash > 0.01;
    this.material.uniforms.uColor.value.set(C.boltColor);
    this.material.uniforms.uIntensity.value = flash * C.boltGlow;
    return flash;
  }
}

/** Half-torus rainbow arcing behind the island. */
export function createRainbow(): THREE.Mesh<THREE.TorusGeometry, THREE.ShaderMaterial> {
  const mat = pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: { uAmount: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying float vR;
        varying float vU;
        void main() {
          vR = length(position.xy);
          vU = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount;
        varying float vR;
        varying float vU;
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float t = clamp((vR - 0.9) / 0.2, 0.0, 1.0); // inner → outer
          vec3 c = hue(0.78 * (1.0 - t));
          float ends = sin(vU * 3.14159);
          float band = smoothstep(0.0, 0.2, t) * smoothstep(1.0, 0.8, t);
          gl_FragColor = vec4(c * band * ends * uAmount * 0.9, 0.0);
        }`,
    }),
  );
  return new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 6, 72, Math.PI), mat);
}
