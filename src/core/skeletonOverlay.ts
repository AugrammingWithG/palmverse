import * as THREE from 'three';
import { debugConfig as D } from './config';
import type { HandData, HandFrame } from './handTypes';
import type { HandTracker } from './handTracker';
import { HAND_CONNECTIONS, FINGERTIPS, type PxPoint } from './landmarks';
import type { Viewport } from './mapping';

const COLORS = { left: '#7fdcff', right: '#ffc27a' };
const _v = new THREE.Vector3();
const _px: PxPoint = { x: 0, y: 0, z: 0 };

/** 2D debug overlay: skeleton, raw points, palm normal and live gesture values. */
export class SkeletonOverlay {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private viewport: Viewport, private tracker: HandTracker) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  draw(frame: HandFrame, clapFlash: number): void {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!D.showSkeleton) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (const hand of frame.hands) this.drawHand(hand);

    if (clapFlash > 0) {
      g.fillStyle = `rgba(255, 230, 255, ${clapFlash * 0.25})`;
      g.fillRect(0, 0, this.viewport.width, this.viewport.height);
    }
  }

  private drawHand(h: HandData): void {
    const g = this.ctx;
    const color = COLORS[h.side];
    const p = h.px;
    g.globalAlpha = h.presence;

    if (D.showRawPoints) {
      const raw = this.tracker.rawPoints(h.side);
      if (raw) {
        g.fillStyle = '#ff5a6e';
        for (const r of raw) g.fillRect(r.x - 2, r.y - 2, 4, 4);
      }
    }

    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.strokeStyle = color;
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      g.moveTo(p[a].x, p[a].y);
      g.lineTo(p[b].x, p[b].y);
    }
    g.stroke();

    for (let i = 0; i < p.length; i++) {
      const tip = FINGERTIPS.includes(i);
      g.beginPath();
      g.arc(p[i].x, p[i].y, tip ? 5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = tip ? '#ffffff' : color;
      g.fill();
    }

    // Palm center + normal (projected)
    const c = this.viewport.worldToPx(h.palmCenter, { x: 0, y: 0, z: 0 });
    _v.copy(h.palmCenter).addScaledVector(h.palmNormal, h.palmSize);
    this.viewport.worldToPx(_v, _px);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c.x, c.y);
    g.lineTo(_px.x, _px.y);
    g.stroke();
    g.beginPath();
    g.arc(c.x, c.y, 6, 0, Math.PI * 2);
    g.strokeStyle = color;
    g.stroke();

    if (h.isPinching) {
      const a = p[4], b = p[8];
      g.beginPath();
      g.arc((a.x + b.x) / 2, (a.y + b.y) / 2, 12, 0, Math.PI * 2);
      g.strokeStyle = '#fff6c8';
      g.lineWidth = 3;
      g.stroke();
    }

    if (D.showLabels) this.drawLabel(h, p[0].x, p[0].y + 26, color);
    g.globalAlpha = 1;
  }

  private drawLabel(h: HandData, x: number, y: number, color: string): void {
    const g = this.ctx;
    const deg = (r: number) => `${Math.round(THREE.MathUtils.radToDeg(r))}°`;
    const lines = [
      `${h.side === 'left' ? 'LEFT' : 'RIGHT'}${h.isFist ? ' · FIST' : ''}${h.isPinching ? ' · PINCH' : ''}${h.tracked ? '' : ' · lost'}`,
      `open ${h.openness.toFixed(2)}  pinch ${h.pinchStrength.toFixed(2)}`,
      `tilt ${deg(h.tilt)}  rot ${deg(h.rotation)}  spread ${h.spread.toFixed(2)}`,
      `palm ${h.palmSize.toFixed(2)}u  score ${h.score.toFixed(2)}`,
    ];
    g.font = '600 12px Manrope, system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 18;
    const lh = 16;
    const hgt = lines.length * lh + 10;
    const bx = Math.min(Math.max(8, x - w / 2), this.viewport.width - w - 8);
    const by = Math.min(Math.max(8, y), this.viewport.height - hgt - 8);
    g.fillStyle = 'rgba(10, 8, 18, 0.72)';
    g.beginPath();
    g.roundRect(bx, by, w, hgt, 8);
    g.fill();
    g.fillStyle = color;
    lines.forEach((l, i) => {
      g.fillStyle = i === 0 ? color : 'rgba(244, 239, 230, 0.85)';
      g.fillText(l, bx + 9, by + 17 + i * lh);
    });
  }
}
