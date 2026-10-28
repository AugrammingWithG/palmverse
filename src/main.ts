import './style.css';
import { friendlyCameraMessage, startCamera } from './core/camera';
import { debugConfig } from './core/config';
import { createDevGui } from './core/devGui';
import { HandTracker } from './core/handTracker';
import { Viewport } from './core/mapping';
import { Renderer } from './core/renderer';
import { SceneManager } from './core/sceneManager';
import { SkeletonOverlay } from './core/skeletonOverlay';
import { UI } from './core/ui';
import { PRELUDE, SCENES } from './scenes';

const video = document.getElementById('webcam') as HTMLVideoElement;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const skeletonCanvas = document.getElementById('skeleton') as HTMLCanvasElement;

const viewport = new Viewport();
const renderer = new Renderer(glCanvas, viewport, video);
const tracker = new HandTracker(viewport, video, glCanvas);
const gui = createDevGui({ onConfidenceChange: () => void tracker.mediapipe.applyConfidence() });
const ui = new UI(SCENES, (def) => void manager.switchTo(def));
const manager = new SceneManager(renderer, viewport, gui, (msg) => ui.toast(msg));
const overlay = new SkeletonOverlay(skeletonCanvas, viewport, tracker);
manager.onChange = (def) => ui.setActiveScene(def);
ui.onToggleSource = () => void toggleSource();

let cameraActive = false;

// Start fetching the model right away so "Start camera" feels instant.
const modelReady = tracker.mediapipe.load();
modelReady.catch((err) => console.error('[palmverse] hand model failed to load', err));

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h);
  overlay.resize(w, h);
  manager.onResize();
}
window.addEventListener('resize', resize);
resize();

function useSource(source: 'camera' | 'mouse'): void {
  tracker.setSource(source);
  renderer.hasVideo = cameraActive;
  ui.setSource(source, source === 'camera' ? `camera · ${tracker.mediapipe.delegate}` : 'mouse hand');
}

async function toggleSource(): Promise<void> {
  if (tracker.source === 'camera') {
    useSource('mouse');
    ui.toast('Mouse hand');
  } else if (cameraActive || (await enableCamera())) {
    useSource('camera');
    ui.toast('Camera');
  } else {
    ui.toast('Camera unavailable, staying on mouse');
  }
}

function syncDebug(): void {
  ui.setDebug(debugConfig.showSkeleton || !gui._hidden);
}

/** Leave the landing: the meadow wilts while the first world loads. */
function enterWorlds(): void {
  ui.hideLoader();
  void manager.switchTo(SCENES[0]);
}

async function enableCamera(): Promise<boolean> {
  ui.setLoaderBusy(true);
  ui.loaderMessage('Waking up your camera…');
  try {
    await startCamera(video);
  } catch (err) {
    ui.loaderMessage(friendlyCameraMessage(err), true);
    ui.setLoaderBusy(false);
    return false;
  }
  cameraActive = true;
  viewport.setVideoSize(video.videoWidth, video.videoHeight);
  ui.loaderMessage('Loading hand tracking…');
  try {
    await modelReady;
  } catch {
    ui.loaderMessage("Couldn't load the hand-tracking model. Check your connection and reload, or try the mouse hand.", true);
    ui.setLoaderBusy(false);
    return false;
  }
  ui.setLoaderBusy(false);
  return true;
}

ui.startCameraBtn.addEventListener('click', async () => {
  if (!(await enableCamera())) return;
  useSource('camera');
  enterWorlds();
});

ui.startMouseBtn.addEventListener('click', () => {
  useSource('mouse');
  enterWorlds();
  ui.toast('Mouse hand · hold click for a fist · Shift to pinch · L adds a left hand', 4600);
});

// ---------- Keys ----------
window.addEventListener('keydown', async (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, .lil-gui')) return;
  // The landing only answers its own buttons; the meadow keeps playing behind it
  if (ui.onLanding) return;

  const key = e.key.toLowerCase();
  const sceneDef = SCENES.find((s) => s.key === key);
  if (sceneDef) {
    void manager.switchTo(sceneDef);
    return;
  }
  if (e.repeat) return;
  switch (key) {
    case 'h':
      debugConfig.showSkeleton = !debugConfig.showSkeleton;
      syncDebug();
      return;
    case 'g':
      gui._hidden ? gui.show() : gui.hide();
      syncDebug();
      return;
    case 'r':
      ui.toggleRecording();
      return;
    case 'f':
      ui.toggleFrameGuide();
      return;
    case '?':
      ui.toggleHelp();
      return;
    case 'escape':
      ui.toggleHelp(false);
      return;
    case 'm':
      await toggleSource();
      return;
    case 'l':
      if (tracker.source === 'mouse') {
        tracker.sim.showLeft = !tracker.sim.showLeft;
        ui.toast(tracker.sim.showLeft ? 'Mirrored left hand on' : 'Left hand off', 1400);
      }
      return;
  }
  manager.onKey(e);
});

// ---------- Loop ----------
let last = performance.now() / 1000;
let fpsFrames = 0;
let fpsTime = 0;
let clapFlash = 0;

// Dev console handle: palmverse.events lists recent gesture events, palmverse.tracker the live data.
const debug = { tracker, manager, renderer, events: [] as object[] };
if (import.meta.env.DEV) Object.assign(window, { palmverse: debug });

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;

  const hands = tracker.update(now, dt);
  for (const e of hands.events) if (e.type === 'clap') clapFlash = 1;
  if (import.meta.env.DEV && hands.events.length) {
    debug.events.push(...hands.events.map((e) => ({ t: +now.toFixed(2), ...e })));
    if (debug.events.length > 50) debug.events.splice(0, debug.events.length - 50);
  }
  clapFlash = Math.max(0, clapFlash - dt * 3);

  manager.update(hands, dt);
  renderer.render(dt);
  overlay.draw(hands, clapFlash);

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    ui.setStats(Math.round(fpsFrames / fpsTime), tracker.source === 'camera' ? tracker.mediapipe.inferenceMs : null);
    ui.setHands(!!hands.left?.tracked, !!hands.right?.tracked, tracker.source === 'camera');
    fpsFrames = 0;
    fpsTime = 0;
  }
}

useSource('mouse');
void manager.switchTo(PRELUDE);
requestAnimationFrame(frame);
