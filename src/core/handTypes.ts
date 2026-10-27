import * as THREE from 'three';
import { NUM_LANDMARKS, type FingerName, type PxPoint, type Side } from './landmarks';

/**
 * Everything a scene needs to know about one hand, refreshed every frame.
 * Vectors are reused between frames: clone them if you need to keep a copy.
 */
export interface HandData {
  side: Side;
  /** True while the hand is currently detected. */
  tracked: boolean;
  /** 0..1, eases in when found and out when lost. Use it to fade objects. */
  presence: number;
  score: number;

  /** Smoothed landmarks in viewport pixels (x right, y down, z toward camera). */
  px: PxPoint[];
  /** Smoothed landmarks in normalized viewport space (0..1, y down). */
  screen: THREE.Vector2[];
  /** Smoothed landmarks in Three.js world space (z = 0 plane fills the viewport). */
  world: THREE.Vector3[];

  palmCenter: THREE.Vector3;
  palmCenterScreen: THREE.Vector2;
  /** Out of the palm (toward the camera when the palm faces it). */
  palmNormal: THREE.Vector3;
  /** Wrist → middle knuckle direction. */
  palmUp: THREE.Vector3;
  /** Completes the right-handed basis (side = up × normal). */
  palmSide: THREE.Vector3;
  /** Rotation whose +Y is palmUp and +Z is palmNormal. */
  palmQuaternion: THREE.Quaternion;
  /** Wrist → middle knuckle length in world units. Use it to scale objects and thresholds. */
  palmSize: number;
  /** Palm center velocity in world units / s. */
  velocity: THREE.Vector3;

  /** 0 = fist, 1 = fully open (mean of four fingers). */
  openness: number;
  isFist: boolean;
  /** 0..1, thumb tip ↔ index tip normalized by palm size. */
  pinchStrength: number;
  isPinching: boolean;
  /** World position between thumb tip and index tip. */
  pinchPoint: THREE.Vector3;
  /**
   * Palm roll in radians around the wrist→middle axis. 0 = palm facing the
   * camera; positive when the thumb rolls toward the camera (same sign for both hands).
   */
  tilt: number;
  /** In-plane rotation of the hand on screen, radians, counter-clockwise, 0 = fingers up. */
  rotation: number;
  /** 0..1 finger spread (fanned out vs. together). */
  spread: number;
  /** Per-finger extension 0 (curled) .. 1 (straight). */
  fingers: Record<FingerName, number>;
}

export type GestureEvent =
  | { type: 'fiststart' | 'fistend'; side: Side }
  | { type: 'pinchstart'; side: Side }
  | { type: 'pinchend'; side: Side; duration: number }
  | { type: 'clap'; position: THREE.Vector3; strength: number }
  | { type: 'handfound' | 'handlost'; side: Side };

export interface HandFrame {
  left: HandData | null;
  right: HandData | null;
  /** Hands with presence > 0, in no particular order. */
  hands: HandData[];
  /** Discrete events that happened since the previous frame. */
  events: GestureEvent[];
  source: 'camera' | 'mouse';
  /** Seconds since start, matches the dt passed to scenes. */
  time: number;
}

export function createHandData(side: Side): HandData {
  const v3 = () => new THREE.Vector3();
  return {
    side,
    tracked: false,
    presence: 0,
    score: 0,
    px: Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0, y: 0, z: 0 })),
    screen: Array.from({ length: NUM_LANDMARKS }, () => new THREE.Vector2()),
    world: Array.from({ length: NUM_LANDMARKS }, v3),
    palmCenter: v3(),
    palmCenterScreen: new THREE.Vector2(),
    palmNormal: new THREE.Vector3(0, 0, 1),
    palmUp: new THREE.Vector3(0, 1, 0),
    palmSide: new THREE.Vector3(1, 0, 0),
    palmQuaternion: new THREE.Quaternion(),
    palmSize: 1,
    velocity: v3(),
    openness: 1,
    isFist: false,
    pinchStrength: 0,
    isPinching: false,
    pinchPoint: v3(),
    tilt: 0,
    rotation: 0,
    spread: 0,
    fingers: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 },
  };
}
