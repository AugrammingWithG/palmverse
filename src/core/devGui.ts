import GUI from 'lil-gui';
import { debugConfig, gestureConfig, renderConfig, simConfig, trackingConfig } from './config';

/** Root lil-gui panel with the core folders. Scenes add their own folder via SceneContext.gui. */
export function createDevGui(hooks: { onConfidenceChange: () => void }): GUI {
  const gui = new GUI({ title: 'Palmverse tuning' });
  gui.hide();

  const t = gui.addFolder('Tracking').close();
  t.add(trackingConfig, 'swapHandedness').name('swap L/R labels');
  t.add(trackingConfig, 'minCutoff', 0.05, 5, 0.05).name('smooth: min cutoff');
  t.add(trackingConfig, 'beta', 0, 0.2, 0.001).name('smooth: beta (lag)');
  t.add(trackingConfig, 'dCutoff', 0.1, 5, 0.1).name('smooth: d cutoff');
  t.add(trackingConfig, 'lostGrace', 0, 1, 0.01).name('lost grace (s)');
  t.add(trackingConfig, 'presenceFade', 0.01, 1, 0.01).name('fade (s)');
  t.add(trackingConfig, 'depthScale', 0, 3, 0.05).name('depth scale');
  for (const key of ['minDetectionConfidence', 'minPresenceConfidence', 'minTrackingConfidence'] as const) {
    t.add(trackingConfig, key, 0.1, 0.95, 0.05).onFinishChange(hooks.onConfidenceChange);
  }

  const g = gui.addFolder('Gestures').close();
  g.add(gestureConfig, 'fingerStraightBend', 0, 1.5, 0.01).name('finger straight bend');
  g.add(gestureConfig, 'fingerCurledBend', 1, 5, 0.05).name('finger curled bend');
  g.add(gestureConfig, 'thumbStraightBend', 0, 1, 0.01).name('thumb straight bend');
  g.add(gestureConfig, 'thumbCurledBend', 0.5, 3, 0.05).name('thumb curled bend');
  g.add(gestureConfig, 'fistOn', 0, 0.6, 0.01).name('fist on <');
  g.add(gestureConfig, 'fistOff', 0, 0.8, 0.01).name('fist off >');
  g.add(gestureConfig, 'pinchClosed', 0, 0.6, 0.01).name('pinch closed dist');
  g.add(gestureConfig, 'pinchOpen', 0.2, 1.5, 0.01).name('pinch open dist');
  g.add(gestureConfig, 'pinchOn', 0.3, 1, 0.01).name('pinch on >');
  g.add(gestureConfig, 'pinchOff', 0.1, 0.9, 0.01).name('pinch off <');
  g.add(gestureConfig, 'spreadMin', 0, 0.4, 0.01).name('spread min');
  g.add(gestureConfig, 'spreadMax', 0.1, 0.8, 0.01).name('spread max');
  g.add(gestureConfig, 'clapContact', 0.5, 3, 0.05).name('clap contact');
  g.add(gestureConfig, 'clapApproachSpeed', 1, 15, 0.1).name('clap approach speed');
  g.add(gestureConfig, 'clapStopSpeed', 0, 5, 0.1).name('clap stop speed');
  g.add(gestureConfig, 'clapWindow', 0.05, 0.8, 0.01).name('clap window (s)');
  g.add(gestureConfig, 'clapCooldown', 0.1, 2, 0.05).name('clap cooldown (s)');

  const r = gui.addFolder('Render').close();
  r.add(renderConfig, 'bloomIntensity', 0, 5, 0.05).name('bloom intensity');
  r.add(renderConfig, 'bloomThreshold', 0, 2, 0.01).name('bloom threshold');
  r.add(renderConfig, 'bloomSmoothing', 0, 1, 0.01).name('bloom smoothing');
  r.add(renderConfig, 'bloomRadius', 0, 1, 0.01).name('bloom radius');
  r.add(renderConfig, 'videoBrightness', 0, 1.5, 0.01).name('video brightness');
  r.add(renderConfig, 'videoSaturation', 0, 1.5, 0.01).name('video saturation');
  r.addColor(renderConfig, 'videoTint').name('video tint');
  r.add(renderConfig, 'adaptiveQuality').name('adaptive quality');
  r.add(renderConfig, 'maxPixelRatio', 0.5, 3, 0.25).name('max pixel ratio');

  const d = gui.addFolder('Debug').close();
  d.add(debugConfig, 'showSkeleton').name('skeleton (H)').listen();
  d.add(debugConfig, 'showRawPoints').name('raw points (red)');
  d.add(debugConfig, 'showLabels').name('gesture labels');

  const s = gui.addFolder('Mouse hand').close();
  s.add(simConfig, 'palmPx', 40, 300, 1).name('palm size px');
  s.add(simConfig, 'closeSpeed', 1, 20, 0.5).name('close speed');

  return gui;
}
