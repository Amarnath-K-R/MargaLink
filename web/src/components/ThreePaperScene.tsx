"use client";

import { useEffect, useRef } from "react";
import { useThreeCanvas } from "@/components/three/useThreeCanvas";
import { buildPaperScene } from "@/components/three/paperSceneGraph";
import { applyFrame, type SceneProgress } from "@/components/three/paperSceneMotion";

type ThreePaperSceneProps = {
  heroProgress: number;
  sections: { matching: number; review: number };
  reducedMotion: boolean;
};

// Where the right-hand lane sits in world units: the text column takes the
// left ~half of the 1180px content width, so accents go right of it.
const laneFor = (width: number) => (width < 1100 ? 2.2 : 1.9);

export default function ThreePaperScene({ heroProgress, sections, reducedMotion }: ThreePaperSceneProps) {
  const progressRef = useRef<SceneProgress>({ hero: heroProgress, ...sections });
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    progressRef.current = { hero: heroProgress, matching: sections.matching, review: sections.review };
  }, [heroProgress, sections.matching, sections.review]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const mountRef = useThreeCanvas((THREE, mount, renderer) => {
    const { scene, camera, paperGroup, analysisGroup, reviewGroup, root } = buildPaperScene(THREE);
    let drewLast = true;
    return {
      camera,
      onFrame: (time) => {
        const width = mount.clientWidth || window.innerWidth;
        const draw = applyFrame(
          { camera, paperGroup, analysisGroup, reviewGroup, root },
          { progress: progressRef.current, reducedMotion: reducedMotionRef.current, time, mobile: width < 760, lane: laneFor(width) },
        );
        // One more render after the scene empties, so the last frame clears.
        if (draw || drewLast) renderer.render(scene, camera);
        drewLast = draw;
      },
    };
  });

  return <div ref={mountRef} className="three-scene" aria-hidden="true" />;
}
