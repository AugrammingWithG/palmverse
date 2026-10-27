# Palmverse

Little living 3D worlds that sit in your hands. Your webcam feed fills the screen (mirrored like a selfie), MediaPipe tracks both hands, and Three.js scenes are composited on top so the magic looks like it is really in your palms. Built for recording vertical TikTok clips, and runs entirely in the browser so anyone can try it from a link.

**Stack:** Vite · TypeScript · Three.js · MediaPipe Tasks Vision `HandLandmarker` · postprocessing (bloom) · lil-gui. No backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
```

The camera needs a secure context: `localhost` works, a LAN IP (`http://192.168.x.x`) does **not**. To try it on your phone, deploy a Vercel preview (below), or tunnel the dev server over https.

## Controls

| Key | Action |
| --- | --- |
| `0`–`4` | Switch scene (also the menu at the bottom) |
| `H` | Hand skeleton overlay with live gesture values |
| `G` | lil-gui tuning panel |
| `R` | Recording mode: hides **all** UI |
| `F` | 9:16 frame guide for vertical clips |
| `M` | Toggle camera ↔ mouse hand |
| `?` | Help panel |

### Mouse hand (no camera needed)

| Input | Action |
| --- | --- |
| Move | Right hand follows the cursor |
| Hold click | Close into a fist |
| `Shift` or right-click | Pinch |
| Wheel | Hand size (simulated depth) |
| `Q` / `E` | Tilt (roll) the palm |
| `L` | Add a mirrored left hand; sweep the mouse to the middle fast to clap |

The mouse hand generates a full 21-point 3D hand and goes through the exact same smoothing and gesture pipeline as the camera, so scenes behave identically.

## Scenes

| Key | Scene | How to play |
| --- | --- | --- |
| `0` | **Hand Lab** | Debug view. Glowing markers sit on your joints; the orb's ring shows palm orientation. Use it to check alignment. |
| `1` | **Palm Terrarium** | A glass dome garden rides your **left** palm. Your open **right** palm is the sun: plants grow (faster with a more open hand), lean toward it, and moss spreads when the sun is close. **Right fist** = night (blue sky, fireflies, glowing flowers and mushrooms). **Both fists for 2 s** = fresh garden. |
| `2` | **Finger Puppet** | `C` cycles creatures. **Jellyfish:** the bell sits on your palm and each finger drives a tentacle (point your fingers down for a classic jellyfish). **Koi / Dragon:** the body traces your **index fingertip's** path; **spread your fingers** to open fins / flare the mane; **pinch** to make the dragon breathe sparks. |
| `3` | **Weather in Your Hands** | A tiny island rides your **left** palm. **Open left hand** = a cloud forms. **Right pinch** = rain intensity. **Quick pinch-and-release** = lightning. `W` cycles rain / snow (the island whitens) / sunny with a rainbow. |
| `4` | **Pour a Galaxy** | A jar sits in your **left** hand, a spiral galaxy in your **right**. **Tip your right palm toward the jar** to pour the stars in an arc. The jar fills and glows. **Clap** = nebula explosion that drifts back into the jar. **Right fist** (with an empty hand) = call the stars back. |

Every scene has its own lil-gui folder (`G`) and a `config.ts` in `src/scenes/<scene>/` with all of its colors, counts, speeds and thresholds.

## Gestures

Every frame, each hand exposes (see [`src/core/handTypes.ts`](src/core/handTypes.ts)):

| Field | Meaning |
| --- | --- |
| `side` | **Your** left/right (MediaPipe's labels are swapped because we feed it the unmirrored frame) |
| `presence` | 0..1, fades in/out when the hand appears or is lost. Use it to fade objects |
| `px` / `screen` / `world` | 21 smoothed landmarks in viewport pixels, normalized screen space, and Three.js world space |
| `palmCenter`, `palmNormal`, `palmUp`, `palmQuaternion` | Palm frame in world space. The normal points out of the palm |
| `palmSize` | Wrist → middle knuckle length (world units). Scale objects and thresholds by it |
| `openness` | 0 = fist, 1 = open (mean extension of four fingers) |
| `isFist` | Fist with hysteresis |
| `pinchStrength` / `isPinching` | Thumb tip ↔ index tip, normalized by palm size |
| `tilt` | Palm roll (radians) around the wrist→middle axis. 0 = palm facing the camera, positive = thumb rolls toward the camera (same sign on both hands) |
| `rotation` | In-plane hand rotation on screen |
| `spread` | 0..1 fingers together ↔ fanned out |
| `fingers` | Per-finger extension 0..1 |
| `velocity` | Palm velocity, world units / s |

Events (`HandFrame.events`): `fiststart`, `fistend`, `pinchstart`, `pinchend` (with `duration`), `handfound`, `handlost`, and the two-hand **`clap`** (palms approach fast, then stop close together; also fires if the hands merge into one detection on contact).

All landmarks are smoothed with a One Euro filter. Tune it live under **G → Tracking**: lower `min cutoff` = less jitter, higher `beta` = less lag.

## How alignment works

The webcam is drawn **inside WebGL** as the last post-processing step. The video shader and the landmark mapping both use [`src/core/mapping.ts`](src/core/mapping.ts) (cover-fit + mirror), so 3D content lines up with your real hands. The world z = 0 plane exactly fills the screen, and landmarks with depth are unprojected so they still land on your fingers. Bloom only touches the 3D layer, so glow spills over the video without blooming bright spots in your room.

If something looks off on camera:
- **Labels swapped?** G → Tracking → `swap L/R labels`.
- **Jittery?** Lower `min cutoff`. **Laggy?** Raise `beta`.
- **Press H** and enable `raw points` to compare raw vs smoothed landmarks.

## Project structure

```
src/
  main.ts                 bootstrap, render loop, keyboard
  core/
    config.ts             tracking / gesture / render tunables (all in lil-gui)
    camera.ts             getUserMedia + friendly errors
    mapping.ts            video cover/mirror ↔ viewport px ↔ world
    mediapipeSource.ts    HandLandmarker (2 hands, GPU → CPU fallback), handedness fix
    simulatedHand.ts      mouse/keyboard hand
    oneEuro.ts            One Euro filter
    handTracker.ts        smoothing, presence, events → HandFrame
    gestures.ts           palm frame, openness, fist, pinch, tilt, spread, clap
    renderer.ts           Three.js + bloom + video composite + adaptive quality
    sceneManager.ts       init / update / dispose, auto-disposal, per-scene GUI folder
    skeletonOverlay.ts    2D debug overlay (H)
    ui.ts / devGui.ts     loader, menu, HUD, recording mode, lil-gui
    anchor.ts             HandAnchor: keeps an object in a palm, glides to rest when the hand leaves
    fx.ts                 glow textures, point sizing, pure-additive blending, soft lighting GLSL
  scenes/
    index.ts              scene registry (lazy-loaded chunks)
    types.ts              Experience / SceneContext interfaces
    hand-lab/             debug scene: verifies hand ↔ 3D alignment
    palm-terrarium/       GPU-bent stems, moss shader, glass, fireflies
    finger-puppet/        verlet tentacles, follow-the-leader spines, dynamic tubes, bubbles
    weather/              low-poly island + water, cloud sprites, rain/snow, lightning, rainbow
    galaxy/               GPU star state machine, webcam-refracting jar, nebula burst
```

Glowing effects use **pure additive** blending (`fx.pureAdditive`): they add light without writing alpha, so they glow over the webcam instead of covering it. The galaxy jar's transmission is patched to refract the live webcam, so the real room bends through the glass.

### Writing a scene

```ts
export default class MyScene implements Experience {
  init(ctx: SceneContext) { /* add objects to ctx.root, controls to ctx.gui */ }
  update(hands: HandFrame, dt: number) { /* hands.left / hands.right / hands.events */ }
  dispose() { /* only things outside ctx.root; the manager disposes ctx.root deeply */ }
}
```

Register it in `src/scenes/index.ts`. Read `ctx.quality.particleScale` to size particle counts; the renderer lowers pixel ratio and then the quality level when the frame rate drops.

## Deploy to Vercel

1. Push this repo to GitHub (already linked: `AugrammingWithG/palmverse`).
2. On [vercel.com/new](https://vercel.com/new), import the repo. Vercel detects Vite; `vercel.json` sets the build (`npm run build` → `dist`), long-term caching for the hashed assets (including the ~13 MB MediaPipe wasm), and a camera permissions policy.
3. Deploy. Every push to `main` redeploys, and every branch or PR gets its own https preview URL, which is handy for testing on your phone.

Or from the CLI: `npm i -g vercel && vercel` (preview) / `vercel --prod`.

The hand model (`hand_landmarker.task`, ~7.5 MB) is fetched from Google's MediaPipe model storage at startup. The wasm runtime is bundled with the app.

## Privacy

Video never leaves the device. Hand tracking runs locally via WebAssembly/WebGL.
