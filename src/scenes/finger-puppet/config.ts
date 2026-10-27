export const puppetConfig = {
  /** Which hand drives the creature when both are visible. */
  preferHand: 'right' as 'right' | 'left',

  // Water mood
  waterTint: '#9fd9ff',
  waterAmount: 0.35,
  bubbleCount: 90,
  bubbleRate: 10,
  moteCount: 140,

  jelly: {
    bellSize: 0.62,
    tentacleLength: 2.6,
    tentacleSegments: 18,
    /** How strongly the first joints stick to your finger (1/s). */
    fingerGrip: 28,
    damping: 0.93,
    drift: 0.6,
    hairCount: 10,
    pulseRate: 0.7,
    colorA: '#7be8ff',
    colorB: '#d58bff',
    glow: 1.6,
  },

  koi: {
    length: 3.2,
    width: 0.3,
    segments: 26,
    swim: 0.08,
    finSpread: 1.0,
    colorBody: '#fff4ea',
    colorPatch: '#ff6a2b',
    colorGlow: '#ffb27a',
    glow: 1.0,
  },

  dragon: {
    length: 5.5,
    width: 0.12,
    segments: 48,
    swim: 0.07,
    colorBody: '#2fbf9f',
    colorBelly: '#ffd27a',
    colorMane: '#7dfff0',
    glow: 1.2,
    breathColor: '#ffcf6b',
  },
};
