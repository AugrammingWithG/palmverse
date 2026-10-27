import * as THREE from 'three';
import { pureAdditive } from '../../core/fx';

const NOISE = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
`;

const STD_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Jellyfish bell: pulsing, fresnel-glowing shell with radial canals and caustic shimmer. */
export function bellMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uGlow: { value: 1 },
        uFade: { value: 1 },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uPulse;
        varying vec3 vN;
        varying vec3 vW;
        varying vec3 vL;
        void main() {
          vec3 p = position;
          // Contract the rim inward and stretch the top on each pulse
          float rim = smoothstep(0.2, 1.0, 1.0 - p.y);
          p.xz *= 1.0 - uPulse * 0.22 * rim;
          p.y *= 1.0 + uPulse * 0.12;
          vL = p;
          vec4 w = modelMatrix * vec4(p, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uGlow;
        uniform float uFade;
        varying vec3 vN;
        varying vec3 vW;
        varying vec3 vL;
        void main() {
          vec3 n = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - abs(dot(n, V)), 2.0);
          float ang = atan(vL.z, vL.x);
          float canals = pow(0.5 + 0.5 * cos(ang * 8.0), 12.0) * smoothstep(1.0, 0.2, vL.y);
          float caustic = vnoise(vL.xz * 5.0 + uTime * 0.6) * vnoise(vL.xz * 7.0 - uTime * 0.4);
          float rimBand = smoothstep(0.25, 0.0, vL.y) * 0.8;
          vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vL.y));
          float a = 0.05 + f * 0.9 + canals * 0.5 + caustic * 0.35 + rimBand;
          gl_FragColor = vec4(col * a * uGlow * uFade, 0.0);
        }`,
    }),
  );
}

/** Tentacles and oral arms: color ramp along the length with light pulses running down. */
export function tentacleMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uGlow: { value: 1 },
        uFade: { value: 1 },
        uSpeed: { value: 2.5 },
      },
      side: THREE.DoubleSide,
      vertexShader: STD_VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uGlow;
        uniform float uFade;
        uniform float uSpeed;
        varying vec3 vN;
        varying vec3 vW;
        varying vec2 vUv;
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);
          float pulse = pow(0.5 + 0.5 * sin(vUv.y * 22.0 - uTime * uSpeed), 6.0);
          float fade = smoothstep(1.0, 0.55, vUv.y);
          vec3 col = mix(uColorA, uColorB, vUv.y);
          float a = (0.25 + f * 0.75 + pulse * 0.9) * fade;
          gl_FragColor = vec4(col * a * uGlow * uFade, 0.0);
        }`,
    }),
  );
}

/**
 * Opaque, softly lit creature skin with bioluminescent rim.
 * uPattern 0 = koi (kohaku patches), 1 = dragon (scales + glowing belly line).
 */
export function skinMaterial(pattern: 0 | 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBody: { value: new THREE.Color() },
      uPatch: { value: new THREE.Color() },
      uGlowColor: { value: new THREE.Color() },
      uGlow: { value: 1 },
      uSeed: { value: Math.random() * 10 },
    },
    defines: { PATTERN: pattern },
    vertexShader: STD_VERT,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime;
      uniform vec3 uBody;
      uniform vec3 uPatch;
      uniform vec3 uGlowColor;
      uniform float uGlow;
      uniform float uSeed;
      varying vec3 vN;
      varying vec3 vW;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        vec3 L = normalize(vec3(-0.3, 0.6, 0.8));
        float diff = max(0.0, (dot(n, L) + 0.4) / 1.4);
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 24.0) * 0.5;
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
        // Around the tube: uv.x = 0.25 is the back (toward camera), 0.75 the belly
        float back = 0.5 + 0.5 * sin(vUv.x * 6.2831);
        vec3 albedo;
        float emit = 0.0;
        #if PATTERN == 0
          // Blotches in (length, across-the-back) space, seamless around the tube
          vec2 q = vec2(vUv.y * 5.5 + uSeed, cos(vUv.x * 6.2831) * 1.6);
          float m = vnoise(q) * 0.65 + vnoise(q * 2.3 + 7.0) * 0.35;
          float patchMask = smoothstep(0.5, 0.56, m) * smoothstep(0.05, 0.45, back);
          float headCap = smoothstep(0.17, 0.1, vUv.y) * smoothstep(0.35, 0.75, back) * step(0.03, vUv.y);
          albedo = mix(uBody, uPatch, max(patchMask, headCap));
          // Glowing lateral-line dots along both flanks (uv.x 0 / 0.5 are the sides)
          float side = min(min(abs(vUv.x), abs(vUv.x - 0.5)), abs(vUv.x - 1.0));
          float dots = smoothstep(0.32, 0.0, length(vec2(fract(vUv.y * 16.0) - 0.5, side * 7.0)));
          emit = dots * smoothstep(0.85, 0.15, vUv.y) * (0.5 + 0.5 * sin(uTime * 3.0 - vUv.y * 20.0));
        #else
          vec2 sc = vec2(vUv.y * 60.0, vUv.x * 14.0);
          sc.y += floor(sc.x) * 0.5;
          float scale = smoothstep(0.5, 0.15, length(fract(sc) - 0.5));
          float belly = smoothstep(0.35, 0.05, abs(vUv.x - 0.75));
          albedo = mix(uBody * (0.75 + 0.35 * scale), uPatch, belly);
          emit = belly * (0.4 + 0.6 * pow(0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 4.0), 4.0));
        #endif
        vec3 c = albedo * (0.35 + diff * 0.85) + spec + uGlowColor * (rim * 0.9 + emit) * uGlow;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Translucent glowing fins with ray stripes (uv.x across the fan, uv.y root → edge). */
export function finMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uGlow: { value: 1 },
        uFade: { value: 1 },
        uTime: { value: 0 },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uGlow;
        uniform float uFade;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float rays = 0.55 + 0.45 * pow(abs(sin(vUv.x * 40.0)), 3.0);
          float edge = smoothstep(0.55, 1.0, vUv.y);
          float shimmer = 0.85 + 0.15 * sin(vUv.y * 12.0 - uTime * 3.0);
          float a = (0.18 + edge * 0.7) * rays * shimmer;
          gl_FragColor = vec4(uColor * a * uGlow * uFade, 0.0);
        }`,
    }),
  );
}

/** Bubbles: soft rings with a highlight. Per-point size and life via attributes. */
export function bubbleMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: { uPxScale: { value: 800 }, uColor: { value: new THREE.Color('#bff3ff') } },
      vertexShader: /* glsl */ `
        uniform float uPxScale;
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPxScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.3, 0.44, d);
          float hl = smoothstep(0.12, 0.0, length(p - vec2(-0.16, -0.16)));
          gl_FragColor = vec4(uColor * (ring * 0.9 + hl * 1.4 + 0.05 * smoothstep(0.5, 0.0, d)) * vAlpha, 0.0);
        }`,
    }),
  );
}

/** Soft glowing dots with per-point size/alpha (dragon breath sparks). */
export function sparkMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: { uPxScale: { value: 800 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        uniform float uPxScale;
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPxScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 hot = mix(uColor, vec3(1.0, 0.95, 0.85), smoothstep(0.15, 0.0, d));
          gl_FragColor = vec4(hot * (a * a * 2.0) * vAlpha, 0.0);
        }`,
    }),
  );
}

/** Drifting plankton motes around a center, fully on the GPU. */
export function moteMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 3 },
        uPxScale: { value: 800 },
        uColor: { value: new THREE.Color('#9ff7ff') },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCenter;
        uniform float uRadius;
        uniform float uPxScale;
        attribute vec4 aSeed;
        varying float vA;
        void main() {
          vec3 f = 0.05 + aSeed.xyz * 0.12;
          vec3 ph = aSeed.wzy * 6.2831;
          float r = uRadius * (0.3 + 0.7 * aSeed.x);
          vec3 p = uCenter + vec3(sin(uTime * f.x + ph.x) * r * 1.3, sin(uTime * f.y + ph.y) * r, cos(uTime * f.z + ph.z) * r * 0.4);
          vA = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (0.8 + aSeed.y * 2.0) + ph.z), 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.025 + aSeed.w * 0.035) * uPxScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFade;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uColor * a * a * vA * 1.4 * uFade, 0.0);
        }`,
    }),
  );
}
