"use client";

import { useEffect, useRef } from "react";
import { clamp01, smooth } from "@/lib/easing";
import { forEachMaterial } from "@/components/three/sceneHelpers";
import { useThreeCanvas } from "@/components/three/useThreeCanvas";
import { buildIntroScene } from "@/components/three/introSceneGraph";

type ThreeIntroSceneProps = { onProgress?: (value: number) => void };

export default function ThreeIntroScene({ onProgress }: ThreeIntroSceneProps) {
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const mountRef = useThreeCanvas((THREE, mount, renderer) => {
    const { scene, camera, world, heroPaper, sidePaper, lowerPaper, inkGroup, inkDots } = buildIntroScene(THREE);
    const started = performance.now();

    return {
      camera,
      onResize: (width) => {
        camera.position.z = width < 680 ? 12.5 : 10.5;
      },
      onFrame: (time) => {
        const elapsed = time - started;
        const progress = Math.min(1, elapsed / 8000);
        const ease = smooth(progress);
        const handoff = clamp01((progress - 0.78) / 0.22);
        onProgressRef.current?.(progress);

        heroPaper.position.y = Math.sin(elapsed * 0.0012) * 0.08;
        heroPaper.rotation.y = -0.2 + Math.sin(elapsed * 0.00075) * 0.14 - ease * 0.24;
        heroPaper.rotation.z = -0.08 + Math.sin(elapsed * 0.0006) * 0.025;
        heroPaper.scale.setScalar(0.84 + ease * 0.2);
        sidePaper.position.x = -2.3 + ease * 0.8;
        sidePaper.rotation.y += 0.0018;
        lowerPaper.position.x = 2.2 - ease * 0.75;
        lowerPaper.rotation.y -= 0.0016;
        inkGroup.rotation.z = Math.sin(elapsed * 0.00035) * 0.04;
        inkDots.rotation.z = elapsed * 0.00008;
        inkDots.children.forEach((child, index) => {
          child.position.z = -0.1 + Math.sin(elapsed * 0.001 + index) * 0.07;
          child.scale.setScalar(0.72 + (Math.sin(elapsed * 0.0015 + index * 0.7) + 1) * 0.18);
        });
        world.rotation.y = Math.sin(elapsed * 0.00032) * 0.08;
        world.position.y = ease * 0.15;
        // Unlike ThreePaperScene's setOpacity (an absolute value reassigned
        // every frame), this multiplies the *current* opacity down each
        // frame — a one-shot decay toward zero as the intro hands off,
        // not a scroll-position-driven value. Different policy, same
        // traversal shape (forEachMaterial).
        forEachMaterial(world, (material) => {
          material.transparent = true;
          material.opacity *= 1 - handoff;
        });
        renderer.render(scene, camera);
      },
    };
  });

  return <div ref={mountRef} className="intro-three-scene" />;
}
