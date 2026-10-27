export const terrariumConfig = {
  // Placement
  /** Dome radius in palm lengths. */
  size: 0.95,
  /** Height above the palm center in palm lengths. */
  lift: 0.15,
  follow: 22,
  restSize: 0.9,
  /** Tilt toward the camera (radians) so the mossy ground is visible. */
  viewTilt: 0.42,

  // Garden
  plantCount: 7,
  /** Growth per second at a fully open sun palm. */
  growthRate: 0.11,
  /** Growth per second with no sun at all, keeps the scene alive. */
  idleGrowth: 0.006,
  /** 0..1 how strongly tips lean toward the sun. */
  phototropism: 0.75,
  leanSpeed: 1.6,
  sway: 0.05,
  /** Sun closer than this (in palm lengths) spreads moss. */
  mossReach: 4.5,
  mossRate: 0.09,

  // Day / night
  nightSpeed: 1.4,
  resetHold: 2.0,

  // Look
  sunColor: '#ffc978',
  sunGlow: 2.6,
  sunLight: 2.4,
  ambientDay: '#6d6157',
  ambientNight: '#1c2650',
  skyNight: '#7f9bff',
  glassColor: '#cfe8ff',
  glassOpacity: 0.55,
  stemColor: '#4f9a52',
  leafColorA: '#5dbb63',
  leafColorB: '#9bd66b',
  mossColor: '#6fb24a',
  soilColor: '#5a3b28',
  flowerColors: ['#ff8fb8', '#ffb36b', '#c79bff', '#ffe27a', '#ff7a7a'],
  flowerNightGlow: 2.2,

  // Fireflies
  fireflyCount: 70,
  fireflySize: 0.06,
  fireflyColor: '#d6ff7a',
  fireflyRange: 1.7,
};
