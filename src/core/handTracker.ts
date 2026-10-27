import { trackingConfig as T } from './config';
import { ClapDetector, computeGestures, releaseGestures } from './gestures';
import { createHandData, type GestureEvent, type HandData, type HandFrame } from './handTypes';
import { NUM_LANDMARKS, type PxPoint, type RawHand, type Side } from './landmarks';
import type { Viewport } from './mapping';
import { MediaPipeSource } from './mediapipeSource';
import { OneEuroFilter } from './oneEuro';
import { SimulatedHandSource } from './simulatedHand';

interface Slot {
  data: HandData;
  filters: OneEuroFilter[];
  /** Unsmoothed points from the latest detection, for the debug overlay. */
  raw: PxPoint[];
  lastSeen: number;
  lastUpdate: number;
  pinchStart: { t: number };
}

/**
 * Turns camera (or simulated) hands into smoothed, labeled, gesture-annotated
 * HandData. Call update() once per rendered frame.
 */
export class HandTracker {
  readonly mediapipe = new MediaPipeSource();
  readonly sim: SimulatedHandSource;
  source: 'camera' | 'mouse' = 'mouse';

  private slots: Record<Side, Slot>;
  private clap = new ClapDetector();
  private events: GestureEvent[] = [];
  private frame: HandFrame;
  private lastIngest = -Infinity;
  /** Shared filter params object, so GUI edits apply instantly. */
  private readonly filterParams = { minCutoff: T.minCutoff, beta: T.beta, dCutoff: T.dCutoff };

  constructor(private viewport: Viewport, private video: HTMLVideoElement, inputTarget: HTMLElement) {
    this.sim = new SimulatedHandSource(inputTarget);
    const makeSlot = (side: Side): Slot => ({
      data: createHandData(side),
      filters: Array.from({ length: NUM_LANDMARKS * 3 }, () => new OneEuroFilter(this.filterParams)),
      raw: Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0, y: 0, z: 0 })),
      lastSeen: -Infinity,
      lastUpdate: -Infinity,
      pinchStart: { t: 0 },
    });
    this.slots = { left: makeSlot('left'), right: makeSlot('right') };
    this.frame = { left: null, right: null, hands: [], events: this.events, source: 'mouse', time: 0 };
  }

  setSource(source: 'camera' | 'mouse'): void {
    this.source = source;
    this.sim.enabled = source === 'mouse';
    for (const s of Object.values(this.slots)) s.lastSeen = -Infinity;
  }

  rawPoints(side: Side): PxPoint[] | null {
    const s = this.slots[side];
    return s.data.tracked ? s.raw : null;
  }

  update(now: number, dt: number): HandFrame {
    this.events.length = 0;
    this.filterParams.minCutoff = T.minCutoff;
    this.filterParams.beta = T.beta;
    this.filterParams.dCutoff = T.dCutoff;

    let raw: RawHand[] | null = null;
    if (this.source === 'camera') raw = this.mediapipe.detect(this.video, this.viewport, now);
    else raw = this.sim.update(dt, this.viewport);

    if (raw) this.ingest(raw, now);

    for (const side of ['left', 'right'] as Side[]) {
      const slot = this.slots[side];
      const d = slot.data;
      const target = d.tracked || now - slot.lastSeen < T.lostGrace ? 1 : 0;
      const step = dt / Math.max(0.01, T.presenceFade);
      d.presence = target > d.presence ? Math.min(1, d.presence + step) : Math.max(0, d.presence - step);
    }

    if (raw) {
      const dtData = Math.min(0.1, now - this.lastIngest);
      this.lastIngest = now;
      this.clap.update(this.slots.left.data, this.slots.right.data, dtData, now, this.events);
    }

    const f = this.frame;
    f.left = this.slots.left.data.presence > 0 ? this.slots.left.data : null;
    f.right = this.slots.right.data.presence > 0 ? this.slots.right.data : null;
    f.hands.length = 0;
    if (f.left) f.hands.push(f.left);
    if (f.right) f.hands.push(f.right);
    f.source = this.source;
    f.time = now;
    return f;
  }

  private ingest(raw: RawHand[], now: number): void {
    const seen: Record<Side, RawHand | undefined> = { left: undefined, right: undefined };
    for (const h of raw) seen[h.side] = h;

    for (const side of ['left', 'right'] as Side[]) {
      const slot = this.slots[side];
      const d = slot.data;
      const hand = seen[side];

      if (!hand) {
        if (d.tracked) {
          d.tracked = false;
          releaseGestures(d, this.events, now, slot.pinchStart);
          this.events.push({ type: 'handlost', side });
        }
        continue;
      }

      const reacquired = now - slot.lastSeen > T.lostGrace + T.presenceFade;
      if (reacquired) slot.filters.forEach((f) => f.reset());
      const dt = reacquired ? 0 : now - slot.lastUpdate;

      for (let i = 0; i < NUM_LANDMARKS; i++) {
        const p = hand.points[i];
        slot.raw[i].x = p.x;
        slot.raw[i].y = p.y;
        slot.raw[i].z = p.z;
        const out = d.px[i];
        out.x = slot.filters[i * 3].filter(p.x, dt);
        out.y = slot.filters[i * 3 + 1].filter(p.y, dt);
        out.z = slot.filters[i * 3 + 2].filter(p.z, dt);
        d.screen[i].set(out.x / this.viewport.width, out.y / this.viewport.height);
        this.viewport.pxToWorld(out, d.world[i]);
      }

      if (!d.tracked) {
        d.tracked = true;
        this.events.push({ type: 'handfound', side });
      }
      d.score = hand.score;
      computeGestures(d, dt, this.events, now, slot.pinchStart);
      slot.lastSeen = now;
      slot.lastUpdate = now;
    }
  }

  dispose(): void {
    this.sim.dispose();
    this.mediapipe.close();
  }
}
