import type * as THREE from "three";
import { between, clamp01, lerp } from "@/lib/easing";
import { setOpacity } from "./sceneHelpers.ts";

// The homepage's 3D layer, driven by each section's own scroll progress (not
// a fraction of the whole page), so its choreography doesn't shift when a
// section is added or resized. Everything lives in the right-hand lane: the
// text column is on the left, and nothing 3D ever passes behind a headline.
//   hero:     the paper, turned toward the reader, then gone as the hero ends
//   matching: the analysis ring, faint, behind the network panel
// On phones (`mobile`) the text is full width, so the scene draws nothing.

export type SceneProgress = {
  hero: number;
  matching: number;
  review: number;
};

type SceneGroups = {
  camera: THREE.PerspectiveCamera;
  paperGroup: THREE.Group;
  analysisGroup: THREE.Group;
  reviewGroup: THREE.Group;
  root: THREE.Group;
};

type Frame = {
  progress: SceneProgress;
  reducedMotion: boolean;
  time: number;
  mobile: boolean;
  lane: number; // x of the right-hand lane in world units, by viewport width
};

// How visible each accent gets: the hero paper is the one bold element; the
// later ones sit behind panels and only need to read as texture.
export const PEAK = { paper: 1, analysis: 0.5 } as const;

// Returns false when there's nothing to draw (the caller skips rendering).
export function applyFrame(groups: SceneGroups, frame: Frame): boolean {
  const { camera, paperGroup, analysisGroup, reviewGroup, root } = groups;
  const { progress, reducedMotion, time, mobile, lane } = frame;
  if (mobile) {
    for (const g of [paperGroup, analysisGroup, reviewGroup]) setOpacity(g, 0);
    return false;
  }
  const drift = reducedMotion ? 0 : time * 0.00035;

  // Hero paper: turns toward the reader over the first half, then slides back and fades.
  const turn = between(progress.hero, 0, 0.5);
  const leave = between(progress.hero, 0.45, 0.9);
  paperGroup.position.set(lane + leave * 0.6, lerp(0.2, 0.05, turn) + Math.sin(drift) * 0.04 - leave * 0.2, -leave * 1.5);
  paperGroup.rotation.set(0, lerp(-0.55, -0.18, turn) - leave * 0.25, lerp(-0.1, -0.04, turn) + Math.sin(drift * 0.9) * 0.01);
  paperGroup.scale.setScalar(1);
  setOpacity(paperGroup, PEAK.paper * (1 - leave));

  // Analysis ring: arrives with the matching section, leaves as review arrives.
  const analysis = between(progress.matching, 0.4, 0.9) * (1 - between(progress.review, 0, 0.5));
  analysisGroup.position.set(lane, 0.06 + Math.sin(drift * 0.7) * 0.05, -0.4);
  analysisGroup.rotation.z = drift * 0.18;
  analysisGroup.scale.setScalar(0.72);
  setOpacity(analysisGroup, PEAK.analysis * analysis);

  // The review sheets read as blank placeholders at this size; the consent
  // panel carries that section on its own.
  setOpacity(reviewGroup, 0);

  root.rotation.y = Math.sin(drift * 0.32) * 0.018;
  camera.position.set(0, 0.1, 11);
  camera.lookAt(0, 0, 0);
  return clamp01(PEAK.paper * (1 - leave)) > 0 || analysis > 0;
}
