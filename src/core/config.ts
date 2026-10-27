/**
 * Core tunables. Everything here is live-editable from the lil-gui panel (G),
 * so code should read from these objects every frame rather than caching values.
 */
export const trackingConfig = {
  /** MediaPipe labels assume a mirrored input. We feed the raw frame, so labels are swapped. */
  swapHandedness: true,
  minDetectionConfidence: 0.6,
  minPresenceConfidence: 0.6,
  minTrackingConfidence: 0.5,

  // One Euro filter on landmark pixels
  minCutoff: 1.4,
  beta: 0.025,
  dCutoff: 1.0,

  /** Seconds a lost hand keeps its last pose while fading out. */
  lostGrace: 0.22,
  /** Seconds for presence to fade in/out. */
  presenceFade: 0.18,
  /** Scales MediaPipe's relative depth (z). 1 = as reported. */
  depthScale: 1.0,
};

export const gestureConfig = {
  // Finger extension from summed joint bend (radians): straight → curled
  fingerStraightBend: 0.35,
  fingerCurledBend: 3.2,
  thumbStraightBend: 0.25,
  thumbCurledBend: 1.4,

  // Fist hysteresis on openness
  fistOn: 0.22,
  fistOff: 0.38,

  // Pinch: thumb-tip ↔ index-tip distance in palm lengths
  pinchClosed: 0.22,
  pinchOpen: 0.75,
  pinchOn: 0.75,
  pinchOff: 0.55,

  // Finger spread: mean angle between adjacent fingers (radians) → 0..1
  spreadMin: 0.08,
  spreadMax: 0.42,

  // Clap: palm-to-palm distance in palm lengths, speeds in palm lengths / s
  clapContact: 1.35,
  clapApproachSpeed: 5.0,
  clapStopSpeed: 1.5,
  clapWindow: 0.28,
  clapCooldown: 0.6,
};

export const renderConfig = {
  maxPixelRatio: 2,
  /** Lowest pixel ratio adaptive quality will drop to. */
  minPixelRatio: 1,
  adaptiveQuality: true,
  bloomIntensity: 1.4,
  bloomThreshold: 0.55,
  bloomSmoothing: 0.25,
  bloomRadius: 0.75,
  exposure: 1.0,
  /** Dims/tints the webcam so glowing objects read better. */
  videoBrightness: 0.92,
  videoSaturation: 0.95,
  videoTint: '#fff6ee',
};

export const debugConfig = {
  showSkeleton: false,
  showRawPoints: false,
  showLabels: true,
};

export const simConfig = {
  /** Palm length (wrist → middle knuckle) in px at default zoom. */
  palmPx: 120,
  closeSpeed: 12,
  tiltSpeed: 2.2,
};
