import * as THREE from 'three';
import type { PxPoint } from './landmarks';

/**
 * Single source of truth for how the mirrored, cover-fitted webcam frame maps
 * to the viewport and to Three.js world space. The video shader and the
 * landmark mapping both read from here, so 3D content lines up with the hands.
 *
 * World space: the z = 0 plane exactly fills the viewport. x right, y up,
 * z toward the viewer. Units: worldHeight is fixed, so 1 unit ≈ 1/7 of the
 * screen height regardless of resolution.
 */
export class Viewport {
  width = 1;
  height = 1;
  videoWidth = 16;
  videoHeight = 9;

  /** Displayed (cover-fitted) video size and offset, in viewport px. */
  drawW = 1;
  drawH = 1;
  offsetX = 0;
  offsetY = 0;

  readonly cameraDistance = 10;
  readonly fov = 40;
  worldHeight = 1;
  worldWidth = 1;
  /** World units per viewport pixel on the z = 0 plane. */
  worldPerPx = 1;

  constructor() {
    this.worldHeight = 2 * this.cameraDistance * Math.tan(THREE.MathUtils.degToRad(this.fov / 2));
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.update();
  }

  setVideoSize(w: number, h: number): void {
    if (w > 0 && h > 0) {
      this.videoWidth = w;
      this.videoHeight = h;
      this.update();
    }
  }

  private update(): void {
    const scale = Math.max(this.width / this.videoWidth, this.height / this.videoHeight);
    this.drawW = this.videoWidth * scale;
    this.drawH = this.videoHeight * scale;
    this.offsetX = (this.width - this.drawW) / 2;
    this.offsetY = (this.height - this.drawH) / 2;
    this.worldPerPx = this.worldHeight / this.height;
    this.worldWidth = this.width * this.worldPerPx;
  }

  /**
   * UV transform for the video quad: videoUV = screenUV * scale + offset,
   * applied after mirroring. Returns [scaleX, scaleY, offsetX, offsetY].
   */
  videoUvTransform(out: THREE.Vector4): THREE.Vector4 {
    const sx = this.width / this.drawW;
    const sy = this.height / this.drawH;
    return out.set(sx, sy, (1 - sx) / 2, (1 - sy) / 2);
  }

  /**
   * MediaPipe normalized landmark (raw, unmirrored frame; z relative to wrist,
   * same scale as x) → mirrored viewport pixels, z toward the camera.
   */
  videoToPx(nx: number, ny: number, nz: number, depthScale: number, out: PxPoint): PxPoint {
    out.x = this.offsetX + (1 - nx) * this.drawW;
    out.y = this.offsetY + ny * this.drawH;
    out.z = -nz * this.drawW * depthScale;
    return out;
  }

  /**
   * Viewport px → world, unprojected at the point's depth so that a landmark
   * with z ≠ 0 still renders exactly on top of the real finger.
   */
  pxToWorld(p: PxPoint, out: THREE.Vector3): THREE.Vector3 {
    const k = this.worldPerPx;
    const z = p.z * k;
    const persp = (this.cameraDistance - z) / this.cameraDistance;
    return out.set((p.x - this.width / 2) * k * persp, -(p.y - this.height / 2) * k * persp, z);
  }

  /** World → viewport px (perspective projection through the scene camera). */
  worldToPx(v: THREE.Vector3, out: PxPoint): PxPoint {
    const k = this.worldPerPx;
    const persp = this.cameraDistance / Math.max(1e-3, this.cameraDistance - v.z);
    out.x = (v.x * persp) / k + this.width / 2;
    out.y = -(v.y * persp) / k + this.height / 2;
    out.z = v.z / k;
    return out;
  }
}
