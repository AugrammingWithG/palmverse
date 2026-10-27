import * as THREE from 'three';
import { pureAdditive } from '../../core/fx';
import { galaxyConfig as C } from './config';

/** Jar dimensions in jar-local units (origin at the bottom center). */
export const JAR = { radius: 0.5, height: 1.5, mouthY: 1.47 };

/**
 * Glass that refracts the *real room*: MeshPhysicalMaterial transmission normally
 * samples the rendered scene, which is empty here because the webcam is composited
 * afterwards. We swap that lookup for the mirrored, cover-fitted webcam.
 */
function roomGlass(video: { texture: THREE.Texture; uvTransform: THREE.Vector4 }): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: C.glassTint,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: C.thickness,
    ior: C.ior,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
    envMapIntensity: 0.9,
    depthWrite: false,
  });
  const uniforms = {
    uVideoMap: { value: video.texture },
    uVideoXform: { value: video.uvTransform },
    uHasVideo: { value: 0 },
    uVideoGain: { value: 1 },
  };
  mat.userData.room = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const target = 'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );';
    const chunk = THREE.ShaderChunk.transmission_pars_fragment;
    if (!chunk.includes(target)) {
      console.warn('[palmverse] transmission chunk changed; jar falls back to default refraction');
      return;
    }
    const helper = /* glsl */ `
      uniform sampler2D uVideoMap;
      uniform vec4 uVideoXform;
      uniform float uHasVideo;
      uniform float uVideoGain;
      vec4 roomSample(vec2 uv) {
        if (uHasVideo > 0.5) {
          vec2 v = uv * uVideoXform.xy + uVideoXform.zw;
          v.x = 1.0 - v.x;
          return vec4(texture2D(uVideoMap, clamp(v, 0.0, 1.0)).rgb * uVideoGain, 1.0);
        }
        return vec4(mix(vec3(0.018, 0.011, 0.028), vec3(0.004, 0.006, 0.016), uv.y), 1.0);
      }
    `;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <transmission_pars_fragment>',
      helper + chunk.replace(target, 'return roomSample( fragCoord.xy );'),
    );
  };
  mat.customProgramCacheKey = () => 'palmverse-room-glass';
  return mat;
}

/** Light that fills the jar from the bottom up as stars settle. */
function fillGlowMaterial(): THREE.ShaderMaterial {
  return pureAdditive(
    new THREE.ShaderMaterial({
      uniforms: {
        uFill: { value: 0 },
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uGlow: { value: 1 },
      },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vL;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vL = position;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFill;
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uGlow;
        varying vec3 vL;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          float level = 0.07 + uFill * 1.25;
          float h = vL.y;
          float below = smoothstep(level + 0.04, level - 0.12, h);
          float ang = atan(vL.z, vL.x);
          float swirl = 0.6 + 0.4 * sin(ang * 3.0 + h * 8.0 - uTime * 1.6);
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.5);
          vec3 col = mix(uColorA, uColorB, clamp(h / max(level, 0.1), 0.0, 1.0));
          gl_FragColor = vec4(col * below * swirl * (0.15 + f * 0.6) * uGlow * min(1.0, uFill * 4.0), 0.0);
        }`,
    }),
  );
}

export class Jar {
  readonly group = new THREE.Group();
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly glow: THREE.ShaderMaterial;
  readonly light = new THREE.PointLight('#ffd9a0', 0, 3, 1.5);

  constructor(video: { texture: THREE.Texture; uvTransform: THREE.Vector4 }) {
    const R = JAR.radius;
    // Mason-jar profile: rounded base, straight body, shoulder, neck and rolled lip
    const profile = [
      [0.0, 0.0], [R * 0.82, 0.0], [R * 0.97, 0.04], [R, 0.12], [R, 1.08], [R * 0.95, 1.2],
      [R * 0.8, 1.3], [R * 0.68, 1.36], [R * 0.68, 1.42], [R * 0.73, 1.45], [R * 0.72, JAR.mouthY], [R * 0.66, JAR.mouthY],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const jarGeo = new THREE.LatheGeometry(profile, 64);
    this.glass = roomGlass(video);
    const jar = new THREE.Mesh(jarGeo, this.glass);
    jar.renderOrder = 1;

    this.glow = fillGlowMaterial();
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.86, 1.32, 48, 12, true).translate(0, 0.06 + 0.66, 0), this.glow);
    inner.renderOrder = 2;
    const base = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 48).rotateX(-Math.PI / 2).translate(0, 0.03, 0), this.glow);
    this.light.position.set(0, 0.45, 0);
    this.group.add(jar, inner, base, this.light);
  }
}
