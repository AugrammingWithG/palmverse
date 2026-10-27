import * as THREE from 'three';
import { LIT_GLSL, pureAdditive } from '../../core/fx';

export type SharedLit = Record<string, THREE.IUniform>;

/** Soft-lit material for (optionally instanced) meshes. Instance colors multiply uColor. */
export function litMaterial(shared: SharedLit, color: THREE.ColorRepresentation, emissive = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) }, uEmissive: { value: emissive } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vColor;
      void main() {
        vec4 lp = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 w = modelMatrix * lp;
        vN = normalize(mat3(modelMatrix) * n);
        vW = w.xyz;
        vColor = uColor;
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIT_GLSL}
      uniform float uEmissive;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vColor;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vW);
        vec3 c = softLight(vColor, n, vW, V) + vColor * uEmissive;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * Stems: a unit cylinder (y 0..1) bent along a per-instance quadratic bezier
 * and clipped by growth, so plants grow along their future path on the GPU.
 */
export function stemMaterial(shared: SharedLit, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      attribute vec3 iP0;
      attribute vec3 iP1;
      attribute vec3 iP2;
      attribute float iGrowth;
      attribute float iRadius;
      varying vec3 vN;
      varying vec3 vW;
      varying float vS;
      vec3 bez(float t) { float u = 1.0 - t; return u * u * iP0 + 2.0 * u * t * iP1 + t * t * iP2; }
      vec3 bezD(float t) { return 2.0 * (1.0 - t) * (iP1 - iP0) + 2.0 * t * (iP2 - iP1); }
      void main() {
        float s = position.y * iGrowth;
        vec3 P = bez(s);
        vec3 T = normalize(bezD(s) + vec3(0.0, 1e-5, 0.0));
        vec3 ref = abs(T.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
        vec3 B = normalize(cross(T, ref));
        vec3 N = cross(B, T);
        float taper = mix(1.0, 0.4, position.y) * smoothstep(0.0, 0.06, iGrowth);
        vec3 radial = position.x * B + position.z * N;
        vec4 w = modelMatrix * vec4(P + radial * iRadius * taper, 1.0);
        vN = normalize(mat3(modelMatrix) * radial);
        vW = w.xyz;
        vS = position.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIT_GLSL}
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vW;
      varying float vS;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 albedo = mix(uColor * vec3(0.55, 0.45, 0.35), uColor * 1.15, smoothstep(0.0, 0.6, vS));
        gl_FragColor = vec4(softLight(albedo, normalize(vN), vW, V), 1.0);
      }`,
  });
}

/** Ground top: soil with a noisy moss patch that spreads outward with uCoverage. */
export function mossMaterial(shared: SharedLit, soil: THREE.ColorRepresentation, moss: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uSoil: { value: new THREE.Color(soil) },
      uMoss: { value: new THREE.Color(moss) },
      uCoverage: { value: 0.2 },
      uTime: { value: 0 },
      uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying vec2 vP;
      varying vec3 vN;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vP = position.xy;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${LIT_GLSL}
      uniform vec3 uSoil;
      uniform vec3 uMoss;
      uniform float uCoverage;
      uniform float uNight;
      varying vec3 vW;
      varying vec2 vP;
      varying vec3 vN;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.15; }
      void main() {
        float r = length(vP);
        float n = fbm(vP * 5.0);
        float edge = uCoverage * 1.08 - r + (n - 0.5) * 0.35;
        float m = smoothstep(0.0, 0.06, edge);
        vec3 soil = uSoil * (0.75 + 0.5 * fbm(vP * 14.0));
        vec3 moss = uMoss * (0.6 + 0.8 * fbm(vP * 18.0 + 3.0));
        vec3 albedo = mix(soil, moss, m);
        vec3 V = normalize(cameraPosition - vW);
        vec3 c = softLight(albedo, normalize(vN), vW, V);
        // Moss tips catch a faint glow at night
        c += uMoss * m * uNight * 0.12 * smoothstep(0.55, 0.9, fbm(vP * 22.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Stylized glass: fresnel rim + highlights, additive so the scene shows through. */
export function glassMaterial(shared: SharedLit, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return pureAdditive(new THREE.ShaderMaterial({
    uniforms: {
      uSunPos: shared.uSunPos,
      uSunIntensity: shared.uSunIntensity,
      uGlass: { value: new THREE.Color(color) },
      uOpacity: { value: 0.55 },
      uCharge: { value: 0 },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunPos;
      uniform float uSunIntensity;
      uniform vec3 uGlass;
      uniform float uOpacity;
      uniform float uCharge;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(n, V)), 2.4);
        vec3 R = reflect(-V, n);
        float spec = pow(max(dot(R, normalize(vec3(-0.45, 0.75, 0.5))), 0.0), 90.0) * 0.7;
        spec += pow(max(dot(R, normalize(uSunPos - vW)), 0.0), 90.0) * uSunIntensity * 0.8;
        float face = gl_FrontFacing ? 1.0 : 0.45;
        vec3 c = uGlass * (0.025 + f * uOpacity) * face + vec3(1.0, 0.97, 0.9) * spec * face;
        c += vec3(0.6, 1.0, 0.7) * f * uCharge * 1.5;
        gl_FragColor = vec4(c, 0.0);
      }`,
  }));
}

/** Fireflies: orbits and flicker are computed on the GPU from per-point seeds. */
export function fireflyMaterial(glowColor: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return pureAdditive(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uSize: { value: 0.06 },
      uPxScale: { value: 800 },
      uObjScale: { value: 1 },
      uRange: { value: 1.7 },
      uColor: { value: new THREE.Color(glowColor) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      uniform float uSize;
      uniform float uPxScale;
      uniform float uObjScale;
      uniform float uRange;
      attribute vec4 aSeed;
      varying float vAlpha;
      void main() {
        vec3 f = 0.12 + aSeed.xyz * 0.32;
        vec3 ph = aSeed.wzy * 6.2831;
        bool inside = aSeed.y < 0.55;
        float r = inside ? 0.72 * (0.3 + 0.7 * aSeed.x) : uRange * (0.6 + 0.4 * aSeed.x);
        vec3 p = vec3(
          sin(uTime * f.x + ph.x) * r,
          0.12 + (0.5 + 0.5 * sin(uTime * f.y + ph.y)) * (inside ? 0.62 : r * 0.9),
          cos(uTime * f.z + ph.z) * r * (inside ? 1.0 : 0.5)
        );
        // Slow upward drift as fireflies wake
        p.y += (1.0 - uNight) * -0.1;
        float fl = pow(0.5 + 0.5 * sin(uTime * (1.5 + aSeed.z * 3.5) + ph.x * 3.0), 3.0);
        vAlpha = uNight * (0.15 + 0.85 * fl) * smoothstep(0.0, 0.6, uNight - aSeed.w * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uObjScale * uPxScale / -mv.z * (0.7 + 0.5 * fl);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float halo = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.14, 0.0, d);
        vec3 c = uColor * (halo * halo * 1.6 + core * 4.0) * vAlpha;
        gl_FragColor = vec4(c, 0.0);
      }`,
  }));
}
