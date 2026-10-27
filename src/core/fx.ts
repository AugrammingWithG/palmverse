import * as THREE from 'three';

/** Soft radial falloff sprite (white), for halos and particles. Caller owns disposal. */
export function createGlowTexture(size = 128, falloff = 2.2): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - r, y + 0.5 - r) / r);
      const a = Math.pow(1 - d, falloff);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * rgb += src.rgb, alpha untouched. Glows add light over the webcam without
 * occluding it (the final composite reads scene alpha as coverage).
 */
export function pureAdditive<T extends THREE.Material>(m: T): T {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

const _size = new THREE.Vector2();

/**
 * Multiplier for gl_PointSize so a point of world size S at view depth z is
 * drawn as S * scale / z pixels, matching perspective meshes.
 */
export function pointPixelScale(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): number {
  renderer.getDrawingBufferSize(_size);
  return _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Seeded PRNG (mulberry32), for reproducible procedural layouts. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** GLSL: soft wrap lighting from one point "sun" + ambient + rim, shared by stylized materials. */
export const LIT_GLSL = /* glsl */ `
uniform vec3 uSunPos;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbient;
uniform vec3 uRimColor;

vec3 softLight(vec3 albedo, vec3 n, vec3 wpos, vec3 viewDir) {
  vec3 L = uSunPos - wpos;
  float d = length(L);
  L /= max(d, 1e-4);
  float wrap = max(0.0, (dot(n, L) + 0.6) / 1.6);
  float att = uSunIntensity / (1.0 + d * d * 0.12);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  return albedo * (uAmbient + uSunColor * wrap * att) + uRimColor * rim;
}
`;

export function litUniforms() {
  return {
    uSunPos: { value: new THREE.Vector3(0, 5, 5) },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uSunIntensity: { value: 1 },
    uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uRimColor: { value: new THREE.Color(0.1, 0.1, 0.1) },
  };
}
