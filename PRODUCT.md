# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **TikTok viewers (primary for the landing screen):** people who tap the creator's link from a video. They arrive curious, have never seen the app, and need to understand within seconds that their own hands will hold living 3D worlds, then grant the camera.
- **The creator (Cre8tive Sync):** records vertical TikTok clips with it, usually on a desktop or laptop webcam. Uses scene keys, recording mode (R), the 9:16 guide (F) and the dev tools (H, G).
- Design leads with desktop, and must still work in portrait on phones.

## Product Purpose

Palmverse is a set of little living 3D worlds that sit in your real hands, seen through your webcam. Success is the illusion holding: objects look like they really rest in, grow from and react to your palms. It also has to be shareable from a single link.

## Positioning

The mechanism is hand-tracked 3D composited over your own mirrored camera feed, entirely in the browser, with no install and no upload. The magic happens in your palms, not on a screen-space filter.

## Operating Context

- Visitors open the link (often from TikTok), read the landing screen, press Start camera (or try it with the mouse) and then play with their hands in front of the webcam.
- While a scene runs, the on-screen chrome should stay quiet and fade when idle. Debug stats (fps, inference ms, source) belong behind a toggle, not in the visitor's face.
- Recording mode (R) must hide every piece of UI.

## Capabilities and Constraints

- Scenes: 0 Hand Lab (debug), 1 Palm Terrarium, 2 Finger Puppet (jellyfish/koi/dragon, C), 3 Weather in Your Hands (rain/snow/sunny, W), 4 Pour a Galaxy.
- Keys: 0–4, H skeleton, G tuning panel, R recording, F 9:16 guide, M camera↔mouse, L mirrored left mouse hand, ? help, Esc.
- Model load: about 13 MB of wasm plus a 7.5 MB model. The landing screen must handle a loading state, camera-denied errors and a mouse fallback.
- Stack: Vite + TypeScript + Three.js + MediaPipe; static deploy on Vercel; no backend.

## Brand Commitments

- Name: **Palmverse**.
- The visual direction is pinned by the creator's references: dark cinematic botanical/ethereal (glowing flowers and moss in darkness, fireflies, starlight), elegant serif display that mixes roman and italic letters within a word, a glowing glass pill holding a word, an iridescent pearl button, soft bloom and prismatic light leaks.

## Evidence on Hand

- No testimonials, press or user counts exist. Do not invent any.
- Real material: the four live scenes themselves.

## Product Principles

1. The illusion is the product: never let UI cover the hands or the scene while playing.
2. Seconds to wonder: a first-time visitor knows what to do (raise your palms) before they finish reading.
3. Privacy is part of the promise: video never leaves the device, and say so plainly.
4. Recording-ready: one key makes the frame clean.
