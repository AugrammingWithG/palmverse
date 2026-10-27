import * as THREE from 'three';
import { damp } from './fx';
import type { HandData } from './handTypes';

export interface AnchorOptions {
  /** World position to rest at when the hand is missing. */
  restPosition: THREE.Vector3;
  /** Object scale at rest. */
  restScale: number;
  /** Object scale per world unit of palm size when held. */
  scalePerPalm: number;
  /** Offset along world up, in palm lengths (positive = above the palm on screen). */
  lift: number;
  /** Follow stiffness (1/s). Higher = tighter to the hand, lower = more weight. */
  follow: number;
  /** How much of the hand's in-plane rotation to inherit (0..1). */
  inheritRoll?: number;
  /** Seconds the hand must be gone before falling back to rest. */
  dropDelay?: number;
}

/**
 * Keeps an object "in" a hand: tracks the palm, scales with palm size (depth),
 * and glides to a rest pose when the hand disappears. Write pose into
 * position/scale/roll and copy them onto your Object3D.
 */
export class HandAnchor {
  readonly position = new THREE.Vector3();
  scale = 1;
  roll = 0;
  /** 0 = resting, 1 = held by the hand. */
  held = 0;
  private initialized = false;
  private goneFor = 0;
  private readonly target = new THREE.Vector3();

  constructor(public opts: AnchorOptions) {}

  update(hand: HandData | null, dt: number): void {
    const o = this.opts;
    const tracked = !!hand && hand.presence > 0.05;
    this.goneFor = tracked ? 0 : this.goneFor + dt;
    const holding = tracked || this.goneFor < (o.dropDelay ?? 0.4);

    let targetScale = o.restScale;
    let targetRoll = 0;
    if (holding && hand) {
      this.target.copy(hand.palmCenter);
      this.target.y += hand.palmSize * o.lift;
      targetScale = hand.palmSize * o.scalePerPalm;
      targetRoll = hand.rotation * (o.inheritRoll ?? 0);
    } else {
      this.target.copy(o.restPosition);
    }

    if (!this.initialized) {
      this.position.copy(this.target);
      this.scale = targetScale;
      this.initialized = true;
    }
    // Snap tighter while held so the illusion holds, glide softly to rest
    const k = damp(holding ? o.follow : 2.5, dt);
    this.position.lerp(this.target, k);
    this.scale += (targetScale - this.scale) * damp(holding ? o.follow * 0.6 : 2.5, dt);
    this.roll += (targetRoll - this.roll) * damp(6, dt);
    this.held += ((holding ? 1 : 0) - this.held) * damp(4, dt);
  }

  apply(obj: THREE.Object3D): void {
    obj.position.copy(this.position);
    obj.scale.setScalar(this.scale);
    obj.rotation.z = this.roll;
  }
}
