/** MediaPipe hand landmark indices. */
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const NUM_LANDMARKS = 21;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Joint chains from base to tip, per finger (wrist excluded). */
export const FINGER_CHAINS: Record<FingerName, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export const FINGERTIPS = [4, 8, 12, 16, 20];

/** Bone pairs for drawing a skeleton. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export type Side = 'left' | 'right';

/** A landmark in viewport pixel space: x right, y down, z toward the camera (px units). */
export interface PxPoint {
  x: number;
  y: number;
  z: number;
}

/** One detected hand before smoothing, already mirrored into viewport pixels. */
export interface RawHand {
  side: Side;
  score: number;
  points: PxPoint[];
}
