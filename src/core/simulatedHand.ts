import * as THREE from 'three';
import { simConfig as S } from './config';
import { NUM_LANDMARKS, type PxPoint, type RawHand } from './landmarks';
import type { Viewport } from './mapping';

/**
 * A procedural hand driven by mouse + keyboard. It produces the same 21
 * landmarks MediaPipe would (in mirrored viewport pixels), so every scene and
 * gesture runs through the exact same pipeline as the camera.
 *
 * Model space: right hand as seen in the mirror, palm facing the camera,
 * wrist at origin, y up, palm length (wrist → middle knuckle) = 1, z toward camera.
 */

interface FingerDef {
  base: [number, number];
  angle: number; // in-plane splay, radians from +y (positive toward +x)
  lengths: [number, number, number];
}

// Index..pinky. The thumb is handled separately.
const FINGERS: FingerDef[] = [
  { base: [-0.27, 0.93], angle: -0.1, lengths: [0.42, 0.25, 0.21] },
  { base: [0, 1], angle: 0, lengths: [0.47, 0.28, 0.22] },
  { base: [0.24, 0.94], angle: 0.1, lengths: [0.43, 0.26, 0.21] },
  { base: [0.44, 0.8], angle: 0.22, lengths: [0.34, 0.2, 0.19] },
];

const THUMB_OPEN = [new THREE.Vector3(-0.42, 0.38, 0.08), new THREE.Vector3(-0.62, 0.55, 0.12), new THREE.Vector3(-0.76, 0.72, 0.14)];
const THUMB_FIST = [new THREE.Vector3(-0.32, 0.42, 0.22), new THREE.Vector3(-0.12, 0.6, 0.34), new THREE.Vector3(0.06, 0.66, 0.36)];

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

function buildHand(openness: number, pinch: number, spread: number, out: THREE.Vector3[]): void {
  const curl = 1 - openness;
  out[0].set(0, 0, 0);

  FINGERS.forEach((f, fi) => {
    const idx = 5 + fi * 4;
    const splay = f.angle * (0.4 + spread * 1.4);
    let fc = curl;
    // Pinching bends the index into a soft hook toward the thumb
    if (fi === 0) fc = Math.max(fc, pinch * 0.5);
    const bends = [1.35 * fc, 1.65 * fc, 1.05 * fc];
    out[idx].set(f.base[0], f.base[1], 0);
    _dir.set(Math.sin(splay), Math.cos(splay), 0);
    // axis × dir = +z, so positive rotations curl the finger toward the camera (palm side)
    _axis.set(Math.cos(splay), -Math.sin(splay), 0);
    for (let s = 0; s < 3; s++) {
      _q.setFromAxisAngle(_axis, bends[s]);
      _dir.applyQuaternion(_q);
      out[idx + s + 1].copy(out[idx + s]).addScaledVector(_dir, f.lengths[s]);
    }
  });

  // Thumb: swings across the palm as the hand closes
  out[1].set(-0.2, 0.18, 0.05);
  for (let i = 0; i < 3; i++) out[2 + i].lerpVectors(THUMB_OPEN[i], THUMB_FIST[i], curl);

  if (pinch > 0) {
    // The thumb reaches over to the hooked index tip (like a real pinch, the index barely moves)
    out[4].lerp(out[8], pinch * 0.94);
    out[3].lerp(_v.lerpVectors(out[2], out[8], 0.55), pinch * 0.7);
  }
}

export class SimulatedHandSource {
  enabled = false;
  showLeft = false;
  private mouse = new THREE.Vector2(-1, -1);
  private closing = false;
  private pinching = false;
  private keysTilt = 0;
  private openness = 1;
  private pinch = 0;
  private tilt = 0;
  private scale = 1;
  private model = Array.from({ length: NUM_LANDMARKS }, () => new THREE.Vector3());
  private readonly abort = new AbortController();

  constructor(target: HTMLElement) {
    const opts = { signal: this.abort.signal };
    target.addEventListener('pointermove', (e) => this.mouse.set(e.clientX, e.clientY), opts);
    target.addEventListener(
      'pointerdown',
      (e) => {
        this.mouse.set(e.clientX, e.clientY);
        if (e.button === 2) this.pinching = true;
        else this.closing = true;
      },
      opts,
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        if (e.button === 2) this.pinching = false;
        else this.closing = false;
      },
      opts,
    );
    target.addEventListener('contextmenu', (e) => this.enabled && e.preventDefault(), opts);
    target.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.scale = THREE.MathUtils.clamp(this.scale * Math.exp(-e.deltaY * 0.0012), 0.4, 2.6);
      },
      { ...opts, passive: true },
    );
    window.addEventListener('keydown', (e) => this.onKey(e, true), opts);
    window.addEventListener('keyup', (e) => this.onKey(e, false), opts);
    window.addEventListener('blur', () => {
      this.closing = this.pinching = false;
      this.keysTilt = 0;
    }, opts);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === 'Shift') this.pinching = down;
    const k = e.key.toLowerCase();
    if (k === 'q') this.keysTilt = down ? -1 : this.keysTilt === -1 ? 0 : this.keysTilt;
    if (k === 'e') this.keysTilt = down ? 1 : this.keysTilt === 1 ? 0 : this.keysTilt;
  }

  update(dt: number, viewport: Viewport): RawHand[] {
    if (this.mouse.x < 0) this.mouse.set(viewport.width * 0.62, viewport.height * 0.62);
    const k = 1 - Math.exp(-S.closeSpeed * dt);
    this.openness += ((this.closing ? 0 : 1) - this.openness) * k;
    this.pinch += ((this.pinching ? 1 : 0) - this.pinch) * k;
    this.tilt = THREE.MathUtils.clamp(this.tilt + this.keysTilt * S.tiltSpeed * dt, -Math.PI * 0.6, Math.PI * 0.6);
    if (this.keysTilt === 0) this.tilt *= Math.exp(-1.5 * dt);

    buildHand(this.openness, this.pinch, 1 - this.pinch * 0.6, this.model);

    // Center the palm on the cursor
    const palmPx = S.palmPx * this.scale * (viewport.height / 900);
    const hands: RawHand[] = [this.project('right', this.mouse.x, this.mouse.y, palmPx)];
    if (this.showLeft) hands.push(this.project('left', viewport.width - this.mouse.x, this.mouse.y, palmPx));
    return hands;
  }

  private project(side: 'left' | 'right', cx: number, cy: number, palmPx: number): RawHand {
    const mirror = side === 'left' ? -1 : 1;
    // Positive tilt = thumb rolls toward the camera = rotate around +y for the right hand
    _q.setFromAxisAngle(_axis.set(0, 1, 0), this.tilt);
    const points: PxPoint[] = this.model.map((m) => {
      _v.copy(m);
      _v.y -= 0.5;
      _v.applyQuaternion(_q);
      return { x: cx + _v.x * palmPx * mirror, y: cy - _v.y * palmPx, z: _v.z * palmPx };
    });
    return { side, score: 1, points };
  }

  dispose(): void {
    this.abort.abort();
  }
}
