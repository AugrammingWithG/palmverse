export const preludeConfig = {
  /** World units between flower beds along the bottom edge. */
  spacing: 1.45,
  /** Bed scale (the terrarium garden is ~1 unit wide); edges grow larger. */
  bedScale: 2.6,
  /** Growth per second once a bed starts. */
  growRate: 0.34,
  /** 0..1 how much stems turn toward the pointer. */
  lean: 0.9,
  /** Night amount for the garden shader: glowing flower hearts and mushrooms. */
  night: 0.85,
  petalGlow: 0.38,

  sunColor: '#ffd49e',
  sunLight: 4.2,
  /** Z of the pointer sun (in front of the meadow). */
  sunDepth: 1.6,
  orbSize: 0.16,
  /** Seconds without pointer movement before the sun drifts on its own. */
  idleAfter: 6,
  ambient: '#17233d',
  rim: '#0b2a2c',
  fireflyColor: '#d6ff7a',
  outroTime: 0.9,
};
