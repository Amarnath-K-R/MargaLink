"use client";

import { useEffect, useRef } from "react";
import { useThreeCanvas } from "@/components/three/useThreeCanvas";
import { buildPaperScene } from "@/components/three/paperSceneGraph";
import { applyFrame } from "@/components/three/paperSceneMotion";

type ThreePaperSceneProps = {
  progress: number;
  heroProgress: number;
  reducedMotion: boolean;
};

export default function ThreePaperScene({ progress, heroProgress, reducedMotion }: ThreePaperSceneProps) {
  const progressRef = useRef(progress);
  const heroProgressRef = useRef(heroProgress);
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    heroProgressRef.current = heroProgress;
  }, [heroProgress]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const mountRef = useThreeCanvas((THREE, mount, renderer) => {
    const { scene, camera, paperGroup, analysisGroup, reviewGroup, root } = buildPaperScene(THREE);

    // Base camera framing per viewport width; scroll-driven panning (in
    // paperSceneMotion's applyFrame) is layered on top of these, not a
    // replacement for them.
    let base = { x: 0, y: 0.1, z: 11 };

    return {
      camera,
      onResize: (width) => {
        base = {
          x: width < 760 ? 0 : width < 1100 ? 0.35 : 0.85,
          y: width < 760 ? 0.15 : 0.1,
          z: width < 760 ? 12.8 : 11,
        };
      },
      onFrame: (time) => {
        const width = mount.clientWidth || window.innerWidth;
        applyFrame(
          { camera, paperGroup, analysisGroup, reviewGroup, root },
          {
            scrollProgress: progressRef.current,
            heroScroll: heroProgressRef.current,
            reducedMotion: reducedMotionRef.current,
            time,
            mobile: width < 760,
            base,
          },
        );
        renderer.render(scene, camera);
      },
    };
  });

  return <div ref={mountRef} className="three-scene" />;
}
