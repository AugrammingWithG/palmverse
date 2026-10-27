import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../../core/fx';
import { weatherConfig as C } from './config';

export const SHORE = 0.6;

/** Island terrain height at local (x, z). Below 0 is under water. */
export function islandHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const R = SHORE * (1 + 0.12 * Math.sin(3 * a) + 0.06 * Math.sin(5 * a + 1));
  if (r >= R) return -0.06;
  const t = 1 - r / R;
  return 0.5 * Math.pow(t, 1.35) + 0.035 * Math.sin(a * 7) * t - 0.03;
}

/** Faceted, vertex-colored, lit by one light + lightning flash; snow covers up-facing faces. */
function lowpolyMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying vec3 vCol;
      varying float vH;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        vW = w.xyz;
        vCol = color;
        vH = p.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightDir;
      uniform vec3 uLightColor;
      uniform vec3 uAmbient;
      uniform vec3 uUp;
      uniform float uSnow;
      uniform float uFlash;
      varying vec3 vW;
      varying vec3 vCol;
      varying float vH;
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        float up = dot(n, uUp);
        // Snow settles on high, flat faces first, then creeps down
        float s = up * 0.65 + clamp(vH / 0.5, 0.0, 1.0) * 0.35;
        float snow = smoothstep(1.02 - uSnow, 1.1 - uSnow, s) * step(0.0, vH + 0.02);
        vec3 albedo = mix(vCol, vec3(0.94, 0.97, 1.0), snow);
        float diff = max(dot(n, uLightDir), 0.0);
        vec3 c = albedo * (uAmbient + uLightColor * diff) + albedo * uFlash * vec3(0.8, 0.9, 1.2);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function waterMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWave;
      varying vec3 vW;
      varying vec2 vP;
      void main() {
        vec3 p = position;
        float r = length(p.xz);
        float edge = smoothstep(1.0, 0.85, r);
        p.y += (sin(p.x * 6.0 + uTime * 1.6) * cos(p.z * 5.0 - uTime * 1.3)
              + 0.45 * sin((p.x + p.z) * 9.0 + uTime * 2.3)) * uWave * edge;
        vP = p.xz;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uLightDir;
      uniform vec3 uLightColor;
      uniform vec3 uAmbient;
      uniform float uFlash;
      uniform float uShore;
      varying vec3 vW;
      varying vec2 vP;
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        vec3 V = normalize(cameraPosition - vW);
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        vec3 col = mix(uShallow, uDeep, smoothstep(uShore * 0.95, 0.95, r));
        float shoreR = uShore * (1.0 + 0.12 * sin(3.0 * a) + 0.06 * sin(5.0 * a + 1.0));
        float foam = smoothstep(0.05, 0.0, abs(r - shoreR - 0.035 - 0.015 * sin(uTime * 2.0 + a * 6.0)));
        float diff = max(dot(n, uLightDir), 0.0);
        float spec = pow(max(dot(reflect(-uLightDir, n), V), 0.0), 40.0);
        vec3 c = col * (uAmbient + uLightColor * (0.4 + 0.6 * diff)) + uLightColor * spec * 0.9 + foam * 0.45;
        c += col * uFlash * 0.8;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function setColor(g: THREE.BufferGeometry, fn: (y: number, i: number) => THREE.Color): void {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getY(i), i);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export class Island {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uTime: { value: 0 },
    uWave: { value: C.waveHeight },
    uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
    uLightColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uAmbient: { value: new THREE.Color(0.35, 0.4, 0.5) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSnow: { value: 0 },
    uFlash: { value: 0 },
    uShallow: { value: new THREE.Color(C.waterShallow) },
    uDeep: { value: new THREE.Color(C.waterDeep) },
    uShore: { value: SHORE },
  };

  constructor() {
    const u = this.uniforms as unknown as Record<string, THREE.IUniform>;
    const lowpoly = lowpolyMaterial(u);

    // Terrain: radial grid that follows the coastline
    const rings = 9;
    const segs = 30;
    const verts: number[] = [];
    const idx: number[] = [];
    verts.push(0, islandHeight(0, 0), 0);
    for (let i = 1; i <= rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
        const R = SHORE * (1 + 0.12 * Math.sin(3 * a) + 0.06 * Math.sin(5 * a + 1)) * 1.08;
        const r = (i / rings) * R;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        verts.push(x, islandHeight(x * 0.999, z * 0.999), z);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 1; i < rings; i++) {
      const a0 = 1 + (i - 1) * segs;
      const b0 = 1 + i * segs;
      for (let j = 0; j < segs; j++) {
        const a = a0 + j, a1 = a0 + ((j + 1) % segs), b = b0 + j, b1 = b0 + ((j + 1) % segs);
        idx.push(a, a1, b, a1, b1, b);
      }
    }
    let terrain = new THREE.BufferGeometry();
    terrain.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    terrain.setIndex(idx);
    terrain = terrain.toNonIndexed();
    const sand = new THREE.Color(C.sand), grass = new THREE.Color(C.grass), rock = new THREE.Color(C.rock);
    const pos = terrain.attributes.position;
    const faceCol = new THREE.Color();
    setColor(terrain, (_y, i) => {
      const f = Math.floor(i / 3) * 3;
      const h = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      return faceCol.copy(h < 0.04 ? sand : h < 0.3 ? grass : rock).multiplyScalar(0.92 + ((f * 7919) % 13) / 100);
    });
    this.group.add(new THREE.Mesh(terrain, lowpoly));

    // Water surface + diorama cut showing depth
    const water = new THREE.RingGeometry(0.001, 1, 56, 14).rotateX(-Math.PI / 2);
    this.group.add(new THREE.Mesh(water, waterMaterial(u)));
    const side = new THREE.CylinderGeometry(1, 1, 0.3, 56, 3, true).translate(0, -0.15, 0).toNonIndexed();
    const deep = new THREE.Color(C.waterDeep);
    setColor(side, (y) => new THREE.Color().copy(deep).multiplyScalar(0.55 + (y + 0.3) * 1.8));
    const base = new THREE.CylinderGeometry(1, 0.93, 0.12, 56, 1).translate(0, -0.36, 0).toNonIndexed();
    setColor(base, () => new THREE.Color('#8a6a4a'));
    this.group.add(new THREE.Mesh(side, lowpoly), new THREE.Mesh(base, lowpoly));

    // Pines and rocks
    const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5).translate(0, 0.15, 0);
    const c1 = new THREE.ConeGeometry(0.32, 0.55, 6).translate(0, 0.5, 0);
    const c2 = new THREE.ConeGeometry(0.24, 0.45, 6).translate(0, 0.78, 0);
    setColor(trunk, () => new THREE.Color('#7a5236'));
    const green = new THREE.Color(C.tree);
    setColor(c1, () => green);
    setColor(c2, () => green.clone().multiplyScalar(1.15));
    const pine = mergeGeometries([trunk.toNonIndexed(), c1.toNonIndexed(), c2.toNonIndexed()])!;
    const r = rng(7);
    const trees = new THREE.InstancedMesh(pine, lowpoly, 6);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    for (let k = 0; k < 200 && placed < 6; k++) {
      const a = r() * Math.PI * 2;
      const d = 0.12 + r() * 0.36;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = islandHeight(x, z);
      if (h < 0.06 || h > 0.32) continue;
      m.compose(new THREE.Vector3(x, h - 0.01, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), s.setScalar(0.17 + r() * 0.09));
      trees.setMatrixAt(placed++, m);
    }
    trees.count = placed;
    const rockGeo = new THREE.DodecahedronGeometry(0.05, 0);
    setColor(rockGeo, () => rock);
    const rocks = new THREE.InstancedMesh(rockGeo, lowpoly, 4);
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * SHORE * 0.95, z = Math.sin(a) * SHORE * 0.95;
      m.compose(new THREE.Vector3(x, 0.0, z), q.random(), s.set(1 + r(), 0.7 + r() * 0.5, 1 + r()));
      rocks.setMatrixAt(k, m);
    }
    this.group.add(trees, rocks);

    trunk.dispose();
    c1.dispose();
    c2.dispose();
  }

  /** Ground height for raindrop hits: terrain or the water surface. */
  surfaceAt(x: number, z: number): { y: number; water: boolean } {
    const h = islandHeight(x, z);
    return h > 0 ? { y: h, water: false } : { y: 0, water: true };
  }
}
