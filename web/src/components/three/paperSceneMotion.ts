import type * as THREE from "three";
import { between, clamp01, lerp } from "@/lib/easing";
import { setOpacity } from "./sceneHelpers.ts";

// Every scroll-linked threshold pair driving this scene's choreography, in
// one named table instead of scattered as bare number literals through
// applyFrame() below — turns "what triggers at 0.42?" into a lookup
// instead of a grep. Values are unchanged from before this extraction.
export const SCROLL = {
  paperTravel: [0.08, 0.4],
  paperReveal: [0.06, 0.22], // heroPaperProgress-based, not scrollProgress
  paperRotateStart: [0.14, 0.42], // heroPaperProgress-based
  paperRotateFlip: [0.38, 0.58], // heroPaperProgress-based
  paperExit: [0.32, 0.55],
  analysisIn: [0.42, 0.52],
  analysisOut: [0.58, 0.68],
  reviewIn: [0.58, 0.7],
  reviewRotate: [0.58, 0.9],
  finalEase: [0.85, 1],
  panJournals: [0.22, 0.38],
  panMatching: [0.4, 0.53],
  panReview: [0.56, 0.7],
  panPrivacy: [0.72, 0.86],
  panFinal: [0.86, 1],
} as const;

type SceneGroups = {
  camera: THREE.PerspectiveCamera;
  paperGroup: THREE.Group;
  analysisGroup: THREE.Group;
  reviewGroup: THREE.Group;
  root: THREE.Group;
};

type Frame = {
  scrollProgress: number;
  heroScroll: number;
  reducedMotion: boolean;
  time: number;
  mobile: boolean;
  base: { x: number; y: number; z: number };
};

export function applyFrame(groups: SceneGroups, frame: Frame): void {
  const { camera, paperGroup, analysisGroup, reviewGroup, root } = groups;
  const { scrollProgress, heroScroll, reducedMotion, time, mobile, base } = frame;
  const driftScale = reducedMotion ? 0 : 1;
  const drift = time * 0.00035;

  const paperTravel = between(scrollProgress, ...SCROLL.paperTravel);
  const heroPaperProgress = Math.max(heroScroll, paperTravel);

  const analysisIn = between(scrollProgress, ...SCROLL.analysisIn);
  const analysisOut = between(scrollProgress, ...SCROLL.analysisOut);
  const reviewIn = between(scrollProgress, ...SCROLL.reviewIn);
  const finalEase = between(scrollProgress, ...SCROLL.finalEase);

  const paperReveal = between(heroPaperProgress, ...SCROLL.paperReveal);
  const paperExit = between(scrollProgress, ...SCROLL.paperExit);
  paperGroup.position.x = mobile
    ? lerp(1.5, -0.72, heroPaperProgress) - paperExit * 0.18
    : lerp(2.4, -0.72, heroPaperProgress) - paperExit * 0.42;
  paperGroup.position.y =
    lerp(0.28, 0.08, heroPaperProgress) + Math.sin(drift) * 0.04 * driftScale + paperExit * 0.08;
  paperGroup.rotation.y =
    lerp(-0.62, -0.08, between(heroPaperProgress, ...SCROLL.paperRotateStart)) +
    Math.PI * between(heroPaperProgress, ...SCROLL.paperRotateFlip) -
    paperExit * 0.08;
  paperGroup.rotation.z = lerp(-0.12, -0.035, heroPaperProgress) + Math.sin(drift * 0.9) * 0.01 * driftScale;
  paperGroup.scale.setScalar((mobile ? 0.82 : 1) * lerp(1, 0.9, paperExit));
  // Hidden on the way down (the middle sections it travelled through are
  // gone); it arrives with the closing section, where it comes to rest.
  setOpacity(paperGroup, clamp01(Math.max(paperReveal, 0.86 - paperExit * 0.64)) * between(scrollProgress, 0.7, 1));

  analysisGroup.position.x = mobile ? 0 : -0.32;
  analysisGroup.position.y = 0.06 + Math.sin(drift * 0.7) * 0.05 * driftScale;
  analysisGroup.rotation.z = drift * 0.18 * driftScale;
  analysisGroup.scale.setScalar(mobile ? 0.72 : 0.92);
  // The analysis ring belonged to the matching section, which is gone.
  void analysisIn; void analysisOut;
  setOpacity(analysisGroup, 0);

  reviewGroup.position.x = mobile ? 0.55 : 1.22;
  reviewGroup.position.y = 0.1 + Math.sin(drift * 0.75) * 0.04 * driftScale;
  reviewGroup.rotation.y = 0.08 * between(scrollProgress, ...SCROLL.reviewRotate);
  reviewGroup.scale.setScalar(mobile ? 0.78 : 0.96);
  setOpacity(reviewGroup, clamp01(reviewIn * (1 - finalEase * 0.55)));

  root.rotation.y = Math.sin(drift * 0.32) * 0.018 * driftScale;

  // Scroll-driven camera pan: a genuine viewpoint drift layered on top of the
  // per-object motion above, giving each section its own vantage rather than a
  // static observer. Frozen at the responsive base framing under reduced motion.
  if (reducedMotion) {
    camera.position.set(base.x, base.y, base.z);
    camera.lookAt(0, 0, 0);
  } else {
    const panJournals = between(scrollProgress, ...SCROLL.panJournals);
    const panMatching = between(scrollProgress, ...SCROLL.panMatching);
    const panReview = between(scrollProgress, ...SCROLL.panReview);
    const panPrivacy = between(scrollProgress, ...SCROLL.panPrivacy);
    const panFinal = between(scrollProgress, ...SCROLL.panFinal);

    camera.position.x = base.x - panJournals * 0.5 + panMatching * 0.35 - panReview * 0.25 + panPrivacy * 0.12;
    camera.position.y = base.y - panMatching * 0.12 + panReview * 0.16 - panFinal * 0.08;
    camera.position.z = base.z - panMatching * 1.3 + panReview * 1.7 + panPrivacy * 1.1 - panFinal * 1.6;
    camera.lookAt(panReview * 0.35 - panFinal * 0.2, panReview * 0.12 - panFinal * 0.1, 0);
  }
}
