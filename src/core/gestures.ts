import * as THREE from 'three';
import { gestureConfig as G } from './config';
import { FINGER_CHAINS, LM } from './landmarks';
import type { GestureEvent, HandData } from './handTypes';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _prevPalm = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function segAngle(w: THREE.Vector3[], a: number, b: number, c: number): number {
  _a.subVectors(w[b], w[a]);
  _b.subVectors(w[c], w[b]);
  return _a.angleTo(_b);
}

function fingerExtension(w: THREE.Vector3[], chain: number[], isThumb: boolean): number {
  if (isThumb) {
    // cmc→mcp→ip→tip
    const bend = segAngle(w, chain[0], chain[1], chain[2]) + segAngle(w, chain[1], chain[2], chain[3]);
    return 1 - smoothstep(G.thumbStraightBend, G.thumbCurledBend, bend);
  }
  const bend =
    segAngle(w, LM.WRIST, chain[0], chain[1]) +
    segAngle(w, chain[0], chain[1], chain[2]) +
    segAngle(w, chain[1], chain[2], chain[3]);
  return 1 - smoothstep(G.fingerStraightBend, G.fingerCurledBend, bend);
}

/**
 * Recomputes palm frame and gesture values from hand.world. Call only when
 * new landmark data arrived; dt is the time since the previous data.
 */
export function computeGestures(hand: HandData, dt: number, events: GestureEvent[], now: number, pinchStart: { t: number }): void {
  const w = hand.world;

  // Palm center: wrist + four knuckles
  _prevPalm.copy(hand.palmCenter);
  const pc = hand.palmCenter.set(0, 0, 0);
  for (const i of [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]) pc.add(w[i]);
  pc.multiplyScalar(1 / 5);
  hand.palmCenterScreen.set(0, 0);
  for (const i of [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]) hand.palmCenterScreen.add(hand.screen[i]);
  hand.palmCenterScreen.multiplyScalar(1 / 5);

  if (dt > 0 && hand.presence > 0) {
    _a.subVectors(pc, _prevPalm).divideScalar(dt);
    hand.velocity.lerp(_a, 0.5);
  } else {
    hand.velocity.set(0, 0, 0);
  }

  hand.palmSize = Math.max(1e-4, w[LM.WRIST].distanceTo(w[LM.MIDDLE_MCP]));

  // Palm frame. In the mirrored view a right palm facing the camera has the
  // thumb on screen-left, so (pinky × index) points out of the palm; mirrored for the left hand.
  const up = hand.palmUp.subVectors(w[LM.MIDDLE_MCP], w[LM.WRIST]).normalize();
  _a.subVectors(w[LM.INDEX_MCP], w[LM.WRIST]);
  _b.subVectors(w[LM.PINKY_MCP], w[LM.WRIST]);
  const n = hand.palmNormal;
  if (hand.side === 'right') n.crossVectors(_b, _a);
  else n.crossVectors(_a, _b);
  n.addScaledVector(up, -n.dot(up)).normalize();
  hand.palmSide.crossVectors(up, n).normalize();
  _m.makeBasis(hand.palmSide, up, n);
  hand.palmQuaternion.setFromRotationMatrix(_m);

  // Tilt: roll around the palm's up axis, relative to "palm faces camera".
  _ref.copy(Z).addScaledVector(up, -up.z);
  if (_ref.lengthSq() > 0.04) {
    _ref.normalize();
    _c.crossVectors(_ref, n);
    let roll = Math.atan2(_c.dot(up), _ref.dot(n));
    if (hand.side === 'left') roll = -roll;
    hand.tilt = roll;
  }
  hand.rotation = Math.atan2(-up.x, up.y);

  // Fingers
  hand.fingers.thumb = fingerExtension(w, FINGER_CHAINS.thumb, true);
  hand.fingers.index = fingerExtension(w, FINGER_CHAINS.index, false);
  hand.fingers.middle = fingerExtension(w, FINGER_CHAINS.middle, false);
  hand.fingers.ring = fingerExtension(w, FINGER_CHAINS.ring, false);
  hand.fingers.pinky = fingerExtension(w, FINGER_CHAINS.pinky, false);
  hand.openness = (hand.fingers.index + hand.fingers.middle + hand.fingers.ring + hand.fingers.pinky) / 4;

  const wasFist = hand.isFist;
  if (hand.isFist ? hand.openness > G.fistOff : hand.openness < G.fistOn) hand.isFist = !hand.isFist;
  if (hand.isFist !== wasFist) events.push({ type: hand.isFist ? 'fiststart' : 'fistend', side: hand.side });

  // Spread: mean angle between adjacent finger base segments
  const dirs = [FINGER_CHAINS.index, FINGER_CHAINS.middle, FINGER_CHAINS.ring, FINGER_CHAINS.pinky];
  let spread = 0;
  for (let i = 0; i < 3; i++) {
    _a.subVectors(w[dirs[i][1]], w[dirs[i][0]]);
    _b.subVectors(w[dirs[i + 1][1]], w[dirs[i + 1][0]]);
    spread += _a.angleTo(_b);
  }
  hand.spread = smoothstep(G.spreadMin, G.spreadMax, spread / 3);

  // Pinch, gated so a closed fist (thumb resting on curled fingers) doesn't read as a pinch
  hand.pinchPoint.addVectors(w[LM.THUMB_TIP], w[LM.INDEX_TIP]).multiplyScalar(0.5);
  const d = w[LM.THUMB_TIP].distanceTo(w[LM.INDEX_TIP]) / hand.palmSize;
  const gate = smoothstep(0.04, 0.22, hand.fingers.index);
  hand.pinchStrength = (1 - smoothstep(G.pinchClosed, G.pinchOpen, d)) * gate;

  const wasPinching = hand.isPinching;
  if (hand.isPinching ? hand.pinchStrength < G.pinchOff : hand.pinchStrength > G.pinchOn) hand.isPinching = !hand.isPinching;
  if (hand.isPinching && !wasPinching) {
    pinchStart.t = now;
    events.push({ type: 'pinchstart', side: hand.side });
  } else if (!hand.isPinching && wasPinching) {
    events.push({ type: 'pinchend', side: hand.side, duration: now - pinchStart.t });
  }
}

/** Resets latched states when a hand disappears, emitting matching end events. */
export function releaseGestures(hand: HandData, events: GestureEvent[], now: number, pinchStart: { t: number }): void {
  if (hand.isFist) {
    hand.isFist = false;
    events.push({ type: 'fistend', side: hand.side });
  }
  if (hand.isPinching) {
    hand.isPinching = false;
    events.push({ type: 'pinchend', side: hand.side, duration: now - pinchStart.t });
  }
  hand.pinchStrength = 0;
  hand.velocity.set(0, 0, 0);
}

/**
 * Two-hand clap: palms approach fast, then stop close together. Hands often
 * merge into one detection on contact, so losing a hand right after a fast
 * close approach also counts.
 */
export class ClapDetector {
  private prevDist = -1;
  private closingSpeed = 0;
  private lastFastTime = -Infinity;
  private lastClapTime = -Infinity;
  private peakSpeed = 0;
  private lastDist = Infinity;
  private readonly mid = new THREE.Vector3();

  update(left: HandData | null, right: HandData | null, dt: number, now: number, events: GestureEvent[]): void {
    const bothTracked = !!left?.tracked && !!right?.tracked;
    if (!bothTracked) {
      // Occlusion fallback: one hand vanished mid-clap
      if (this.prevDist >= 0 && now - this.lastFastTime < Math.max(G.clapWindow, dt * 3) && this.lastDist < G.clapContact * 1.6) {
        this.fire(now, events);
      }
      this.prevDist = -1;
      this.closingSpeed = 0;
      return;
    }

    const scale = (left!.palmSize + right!.palmSize) / 2;
    const dx = left!.palmCenter.x - right!.palmCenter.x;
    const dy = left!.palmCenter.y - right!.palmCenter.y;
    const dist = Math.hypot(dx, dy) / scale;
    this.mid.addVectors(left!.palmCenter, right!.palmCenter).multiplyScalar(0.5);

    // Time-based so it behaves the same at 15 fps on a phone and 60 fps on a laptop
    const clapWindow = Math.max(G.clapWindow, dt * 3);
    if (this.prevDist >= 0 && dt > 0) {
      const speed = (this.prevDist - dist) / dt;
      this.closingSpeed += (speed - this.closingSpeed) * (1 - Math.exp(-dt / 0.025));
      if (this.closingSpeed > G.clapApproachSpeed) {
        this.lastFastTime = now;
        this.peakSpeed = Math.max(this.peakSpeed, this.closingSpeed);
      }
      const stopped = this.closingSpeed < G.clapStopSpeed;
      if (dist < G.clapContact && stopped && now - this.lastFastTime < clapWindow) this.fire(now, events);
    }
    if (now - this.lastFastTime > clapWindow) this.peakSpeed = 0;
    this.prevDist = dist;
    this.lastDist = dist;
  }

  private fire(now: number, events: GestureEvent[]): void {
    if (now - this.lastClapTime < G.clapCooldown) return;
    this.lastClapTime = now;
    this.lastFastTime = -Infinity;
    const strength = THREE.MathUtils.clamp(this.peakSpeed / (G.clapApproachSpeed * 2.5), 0.3, 1);
    events.push({ type: 'clap', position: this.mid.clone(), strength });
    this.peakSpeed = 0;
  }
}
