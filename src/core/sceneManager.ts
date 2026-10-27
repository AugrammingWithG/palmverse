import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { Experience, SceneContext, SceneDef } from '../scenes/types';
import type { HandFrame } from './handTypes';
import type { Viewport } from './mapping';
import type { Renderer } from './renderer';

/** Disposes every geometry, material and texture under an object. */
export function disposeDeep(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const disposeMaterial = (m: THREE.Material) => {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) {
      for (const u of Object.values(uniforms)) {
        if (u?.value instanceof THREE.Texture) textures.add(u.value);
      }
    }
    m.dispose();
  };
  root.traverse((obj) => {
    const o = obj as THREE.Mesh;
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
    if ((obj as THREE.InstancedMesh).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
  });
  textures.forEach((t) => t.dispose());
}

export class SceneManager {
  current: SceneDef | null = null;
  private experience: Experience | null = null;
  private ctx: SceneContext | null = null;
  private switchToken = 0;
  onChange: ((def: SceneDef) => void) | null = null;

  constructor(
    private renderer: Renderer,
    private viewport: Viewport,
    private gui: GUI,
    private toast: (msg: string) => void,
  ) {
    renderer.onQualityChange = (q) => {
      if (this.ctx) {
        this.ctx.quality.level = q;
        this.ctx.quality.particleScale = renderer.particleScale;
      }
      this.experience?.onQualityChange?.(q);
    };
  }

  async switchTo(def: SceneDef): Promise<void> {
    if (!def.load || def === this.current) return;
    const token = ++this.switchToken;
    const mod = await def.load();
    if (token !== this.switchToken) return;

    this.teardown();
    const root = new THREE.Group();
    root.name = def.id;
    this.renderer.scene.add(root);
    const ctx: SceneContext = {
      root,
      scene: this.renderer.scene,
      camera: this.renderer.camera,
      renderer: this.renderer.renderer,
      viewport: this.viewport,
      gui: this.gui.addFolder(def.title),
      quality: { level: this.renderer.quality, particleScale: this.renderer.particleScale },
      toast: this.toast,
    };
    const exp = new mod.default();
    this.ctx = ctx;
    this.experience = exp;
    this.current = def;
    await exp.init(ctx);
    this.onChange?.(def);
    if (def.hint) this.toast(def.hint);
  }

  update(hands: HandFrame, dt: number): void {
    this.experience?.update(hands, dt);
  }

  onKey(e: KeyboardEvent): boolean {
    return this.experience?.onKey?.(e) ?? false;
  }

  onResize(): void {
    this.experience?.onResize?.();
  }

  private teardown(): void {
    if (!this.experience || !this.ctx) return;
    this.experience.dispose();
    const { root, gui, scene } = this.ctx;
    scene.remove(root);
    disposeDeep(root);
    gui.destroy();
    for (const tex of [scene.background, scene.environment]) {
      if (tex instanceof THREE.Texture) tex.dispose();
    }
    scene.background = null;
    scene.environment = null;
    scene.fog = null;
    this.experience = null;
    this.ctx = null;
  }
}
