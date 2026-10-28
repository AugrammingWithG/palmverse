import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { renderConfig as R } from './config';
import type { Viewport } from './mapping';

/**
 * Final composite: 3D layer (already bloomed + tone mapped) over the mirrored,
 * cover-fitted webcam. Scene alpha comes from the pre-bloom input buffer, so
 * bloom glow is purely additive over the video and never blooms the room.
 */
const compositeFrag = /* glsl */ `
uniform sampler2D videoTex;
uniform vec4 uvXform;
uniform float hasVideo;
uniform vec3 tint;
uniform float brightness;
uniform float saturation;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 bg;
  if (hasVideo > 0.5) {
    vec2 vuv = uv * uvXform.xy + uvXform.zw;
    vuv.x = 1.0 - vuv.x;
    bg = texture2D(videoTex, vuv).rgb;
    float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
    bg = mix(vec3(l), bg, saturation) * tint * brightness;
  } else {
    // Night-garden backdrop for mouse mode: green-black with a low teal clearing
    float v = smoothstep(0.0, 1.0, uv.y);
    bg = mix(vec3(0.014, 0.024, 0.022), vec3(0.004, 0.006, 0.008), v);
    float d = length((uv - vec2(0.5, 0.12)) * vec2(aspect, 1.4));
    bg += vec3(0.012, 0.05, 0.05) * exp(-d * d * 1.8);
  }
  float a = clamp(texture2D(inputBuffer, uv).a, 0.0, 1.0);
  outputColor = vec4(inputColor.rgb + bg * (1.0 - a), 1.0);
}
`;

class VideoCompositeEffect extends Effect {
  constructor(videoTex: THREE.Texture) {
    super('VideoCompositeEffect', compositeFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['videoTex', new THREE.Uniform(videoTex)],
        ['uvXform', new THREE.Uniform(new THREE.Vector4(1, 1, 0, 0))],
        ['hasVideo', new THREE.Uniform(0)],
        ['tint', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ['brightness', new THREE.Uniform(1)],
        ['saturation', new THREE.Uniform(1)],
      ]),
    });
  }
}

export type QualityLevel = 'high' | 'medium' | 'low';

/** Per-scene multipliers on the webcam look (night tint, storm darkening…). Reset on scene switch. */
export interface VideoGrade {
  tint: THREE.Color;
  brightness: number;
  saturation: number;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: BloomEffect;
  private readonly composite: VideoCompositeEffect;
  readonly videoTexture: THREE.VideoTexture;
  /** Screen UV → video UV (before mirroring): xy scale, zw offset. Updated every frame. */
  readonly videoUv = new THREE.Vector4(1, 1, 0, 0);
  hasVideo = false;
  readonly grade: VideoGrade = { tint: new THREE.Color(1, 1, 1), brightness: 1, saturation: 1 };

  pixelRatio: number;
  quality: QualityLevel = 'high';
  /** Called when adaptive quality changes level; scenes can thin out particles. */
  onQualityChange: ((q: QualityLevel) => void) | null = null;
  private fpsWindow: number[] = [];
  private governorTimer = 0;

  constructor(canvas: HTMLCanvasElement, private viewport: Viewport, video: HTMLVideoElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, R.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.camera = new THREE.PerspectiveCamera(viewport.fov, 1, 0.1, 100);
    this.camera.position.set(0, 0, viewport.cameraDistance);

    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(4, this.renderer.capabilities.maxSamples),
    });
    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clearPass.overrideClearColor = new THREE.Color(0, 0, 0);
    renderPass.clearPass.overrideClearAlpha = 0;
    this.composer.addPass(renderPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: R.bloomIntensity,
      luminanceThreshold: R.bloomThreshold,
      luminanceSmoothing: R.bloomSmoothing,
      radius: R.bloomRadius,
    });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    this.composite = new VideoCompositeEffect(this.videoTexture);
    this.composer.addPass(new EffectPass(this.camera, this.bloom, toneMapping, this.composite));
  }

  resize(width: number, height: number): void {
    this.viewport.setSize(width, height);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setPixelRatio(pr: number): void {
    this.pixelRatio = pr;
    this.resize(this.viewport.width, this.viewport.height);
  }

  render(dt: number): void {
    // Live-tunable values
    this.bloom.intensity = R.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = R.bloomThreshold;
    this.bloom.luminanceMaterial.smoothing = R.bloomSmoothing;
    this.bloom.mipmapBlurPass.radius = R.bloomRadius;

    const u = this.composite.uniforms;
    u.get('hasVideo')!.value = this.hasVideo ? 1 : 0;
    this.viewport.videoUvTransform(this.videoUv);
    u.get('uvXform')!.value.copy(this.videoUv);
    (u.get('tint')!.value as THREE.Color).set(R.videoTint).multiply(this.grade.tint);
    u.get('brightness')!.value = R.videoBrightness * this.grade.brightness;
    u.get('saturation')!.value = R.videoSaturation * this.grade.saturation;

    this.composer.render(dt);
    this.governQuality(dt);
  }

  /** Drops pixel ratio (then quality level) when the frame rate sags, raises it back when there's headroom. */
  private governQuality(dt: number): void {
    if (!R.adaptiveQuality || dt <= 0) return;
    this.fpsWindow.push(1 / dt);
    if (this.fpsWindow.length > 90) this.fpsWindow.shift();
    this.governorTimer += dt;
    if (this.governorTimer < 2.5 || this.fpsWindow.length < 60) return;
    this.governorTimer = 0;
    const sorted = [...this.fpsWindow].sort((a, b) => a - b);
    const p20 = sorted[Math.floor(sorted.length * 0.2)];
    const maxPr = Math.min(window.devicePixelRatio || 1, R.maxPixelRatio);

    if (p20 < 48) {
      if (this.pixelRatio > R.minPixelRatio + 0.01) {
        this.setPixelRatio(Math.max(R.minPixelRatio, this.pixelRatio - 0.25));
      } else if (this.quality !== 'low') {
        this.setQuality(this.quality === 'high' ? 'medium' : 'low');
      }
      this.fpsWindow.length = 0;
    } else if (p20 > 58 && this.pixelRatio < maxPr - 0.01) {
      this.setPixelRatio(Math.min(maxPr, this.pixelRatio + 0.25));
      this.fpsWindow.length = 0;
    }
  }

  resetGrade(): void {
    this.grade.tint.setRGB(1, 1, 1);
    this.grade.brightness = 1;
    this.grade.saturation = 1;
  }

  private setQuality(q: QualityLevel): void {
    this.quality = q;
    this.onQualityChange?.(q);
  }

  get particleScale(): number {
    return this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.6 : 0.35;
  }
}
