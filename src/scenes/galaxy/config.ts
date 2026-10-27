export const galaxyConfig = {
  // Stars
  starCount: 6000,
  starSize: 0.035,
  /** Galaxy disc radius in palm lengths. */
  galaxyRadius: 0.75,
  /** Galaxy hovers this far off the palm (palm lengths, along the palm normal). */
  galaxyLift: 0.45,
  spinSpeed: 0.6,
  colorCore: '#ffe2b0',
  colorArm: '#9fc4ff',
  colorDust: '#ff9fe0',

  // Pouring
  /** How far the palm must turn toward the jar before stars spill (0..1). */
  pourStart: 0.2,
  pourFull: 0.6,
  /** Stars per second at a full pour. */
  pourRate: 1400,
  flightTime: 0.85,
  arcHeight: 0.9,

  // Jar (palm lengths)
  jarSize: 1.0,
  jarLift: 0.05,
  follow: 22,
  restSize: 1.1,
  glassTint: '#e8f4ff',
  ior: 1.35,
  thickness: 0.35,
  fillGlow: 1.5,
  swirlSpeed: 0.9,

  // Clap
  burstRadius: 0.55,
  /** Seconds before stars start drifting home after a clap. */
  returnDelay: 2.4,
  returnTime: 3.0,
  nebulaColors: ['#ff4fd8', '#8b5cff', '#4fd8ff', '#ffc06b', '#ff6f91'],
  nebulaGlow: 1.0,
};
