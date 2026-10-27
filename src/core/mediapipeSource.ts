import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
// Self-hosted through Vite so the wasm always matches the installed JS version.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { trackingConfig as T } from './config';
import { NUM_LANDMARKS, type PxPoint, type RawHand, type Side } from './landmarks';
import type { Viewport } from './mapping';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

interface SideMemory {
  lastSeen: number;
  wrist: PxPoint;
}

/**
 * Runs MediaPipe HandLandmarker on the raw (unmirrored) webcam frame and
 * returns hands in mirrored viewport pixels, labeled as the user's own hands.
 */
export class MediaPipeSource {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  delegate: 'GPU' | 'CPU' = 'GPU';
  /** Last inference time in ms, for the HUD. */
  inferenceMs = 0;
  private memory: Record<Side, SideMemory> = {
    left: { lastSeen: -Infinity, wrist: { x: 0, y: 0, z: 0 } },
    right: { lastSeen: -Infinity, wrist: { x: 0, y: 0, z: 0 } },
  };

  async load(): Promise<void> {
    if (this.landmarker) return;
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: T.minDetectionConfidence,
      minHandPresenceConfidence: T.minPresenceConfidence,
      minTrackingConfidence: T.minTrackingConfidence,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[palmverse] GPU delegate failed, falling back to CPU', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
      this.delegate = 'CPU';
    }
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  async applyConfidence(): Promise<void> {
    await this.landmarker?.setOptions({
      minHandDetectionConfidence: T.minDetectionConfidence,
      minHandPresenceConfidence: T.minPresenceConfidence,
      minTrackingConfidence: T.minTrackingConfidence,
    });
  }

  /** Returns null when there is no new video frame since the last call. */
  detect(video: HTMLVideoElement, viewport: Viewport, nowSec: number): RawHand[] | null {
    if (!this.landmarker || video.readyState < 2) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;

    // detectForVideo needs strictly increasing timestamps
    const ts = Math.max(performance.now(), this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, ts);
    this.inferenceMs = performance.now() - t0;

    viewport.setVideoSize(video.videoWidth, video.videoHeight);
    return this.toRawHands(result, viewport, nowSec);
  }

  private toRawHands(result: HandLandmarkerResult, viewport: Viewport, now: number): RawHand[] {
    const hands: RawHand[] = result.landmarks.map((lms, i) => {
      const cat = result.handedness[i]?.[0];
      const label = cat?.categoryName === 'Left' ? 'left' : 'right';
      // MediaPipe assumes a selfie-mirrored image. Our input is the raw frame,
      // so its "Left" is the user's right hand.
      const side: Side = T.swapHandedness ? (label === 'left' ? 'right' : 'left') : label;
      const points: PxPoint[] = new Array(NUM_LANDMARKS);
      for (let j = 0; j < NUM_LANDMARKS; j++) {
        const l = lms[j];
        points[j] = viewport.videoToPx(l.x, l.y, l.z, T.depthScale, { x: 0, y: 0, z: 0 });
      }
      return { side, score: cat?.score ?? 0, points };
    });

    if (hands.length === 2 && hands[0].side === hands[1].side) {
      // Both got the same label: the one further right on screen is the right hand.
      const [a, b] = hands[0].points[0].x > hands[1].points[0].x ? [hands[0], hands[1]] : [hands[1], hands[0]];
      a.side = 'right';
      b.side = 'left';
    } else if (hands.length === 1) {
      this.keepContinuity(hands[0], now);
    }
    if (hands.length > 2) hands.length = 2;

    for (const h of hands) {
      const m = this.memory[h.side];
      m.lastSeen = now;
      m.wrist = { ...h.points[0] };
    }
    return hands;
  }

  /**
   * A single hand whose label flips for a frame or two would teleport scene
   * objects between hands. If the other side was just seen right here and the
   * labeled side wasn't, trust continuity over a low-confidence label.
   */
  private keepContinuity(hand: RawHand, now: number): void {
    const other: Side = hand.side === 'left' ? 'right' : 'left';
    const mo = this.memory[other];
    const ms = this.memory[hand.side];
    const recentOther = now - mo.lastSeen < 0.35;
    const recentSame = now - ms.lastSeen < 0.35;
    if (!recentOther || recentSame || hand.score > 0.9) return;
    const palm = Math.hypot(hand.points[9].x - hand.points[0].x, hand.points[9].y - hand.points[0].y);
    const jump = Math.hypot(hand.points[0].x - mo.wrist.x, hand.points[0].y - mo.wrist.y);
    if (jump < palm * 1.2) hand.side = other;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
