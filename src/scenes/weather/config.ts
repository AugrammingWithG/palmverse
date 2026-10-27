export type WeatherMode = 'rain' | 'snow' | 'sunny';

export const weatherConfig = {
  mode: 'rain' as WeatherMode,

  // Placement (island radius in palm lengths)
  size: 0.95,
  lift: 0.35,
  follow: 22,
  restSize: 1.0,
  viewTilt: 0.5,

  // Cloud
  cloudPuffs: 22,
  cloudHeight: 1.45,
  cloudFormSpeed: 1.6,
  stormCloud: '#6f7a8c',
  fairCloud: '#ffffff',

  // Precipitation
  maxDrops: 650,
  dropSpeed: 3.6,
  maxFlakes: 450,
  flakeSpeed: 0.38,
  snowRate: 0.06,
  meltRate: 0.025,
  /** Minimum pinch for any rain at all. */
  pinchDeadzone: 0.08,

  // Lightning
  /** A pinch shorter than this (s) counts as a "flick" and strikes. */
  flickMax: 0.4,
  boltColor: '#cfe4ff',
  boltGlow: 6,
  flashStrength: 1.0,

  // Water & island
  waterShallow: '#4fe3d0',
  waterDeep: '#1a6fae',
  waveHeight: 0.035,
  sand: '#ecd7a0',
  grass: '#6cc86a',
  rock: '#9b8f87',
  tree: '#2f9b5a',
};
