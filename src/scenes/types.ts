import type * as THREE from 'three';
import type GUI from 'lil-gui';
import type { HandFrame } from '../core/handTypes';
import type { Viewport } from '../core/mapping';
import type { QualityLevel, VideoGrade } from '../core/renderer';

export interface SceneContext {
  /** Add everything here. Geometries, materials and textures under it are disposed on switch. */
  root: THREE.Group;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  viewport: Viewport;
  /** This scene's lil-gui folder; destroyed on switch. */
  gui: GUI;
  quality: { level: QualityLevel; particleScale: number };
  /** Multipliers on the webcam look; reset automatically when the scene closes. */
  grade: VideoGrade;
  /** Show a short message on screen (hidden in recording mode unless important). */
  toast: (msg: string) => void;
}

/** One experience: created on switch, disposed when leaving. */
export interface Experience {
  init(ctx: SceneContext): void | Promise<void>;
  update(hands: HandFrame, dt: number): void;
  /** Free anything not under ctx.root (render targets, listeners, timers…). */
  dispose(): void;
  /** Return true if the key was handled. */
  onKey?(e: KeyboardEvent): boolean;
  onResize?(): void;
  onQualityChange?(level: QualityLevel): void;
}

export interface SceneDef {
  key: string;
  id: string;
  title: string;
  /** One line shown when the scene opens. */
  hint: string;
  /** Lazy-loaded so each scene is its own chunk. Undefined = not built yet. */
  load?: () => Promise<{ default: new () => Experience }>;
}
