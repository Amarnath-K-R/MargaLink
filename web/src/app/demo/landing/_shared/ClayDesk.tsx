"use client";

import { useEffect, useRef } from "react";
import { useThreeCanvas } from "@/components/three/useThreeCanvas";
import { buildDesk, type DeskLayout } from "./clayDesk.ts";

// The clay desk as a full-bleed canvas: scene from clayDesk.ts, rendered
// through N8AO (soft, warm-tinted ambient occlusion — the contact darkening
// that sells the clay look), written straight to the screen.
export default function ClayDesk({ layout, className }: { layout: DeskLayout; className?: string }) {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const mountRef = useThreeCanvas((THREE, _mount, renderer) => {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desk = buildDesk(THREE, renderer, layout, reduced);

    type Composer = { render: () => void; setSize: (w: number, h: number) => void };
    let composer: Composer | null = null;
    let size = { w: 1, h: 1 };
    // Post-processing loads async; frames before it's ready render directly.
    // ?ao=0 renders without post-processing (for comparing).
    if (new URLSearchParams(window.location.search).get("ao") !== "0") void Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("n8ao"),
    ]).then(([{ EffectComposer }, { N8AOPass }]) => {
      const c = new EffectComposer(renderer);
      const ao = new N8AOPass(desk.scene, desk.camera, size.w, size.h);
      ao.configuration.aoRadius = 1.6;
      ao.configuration.distanceFalloff = 0.9;
      ao.configuration.intensity = 2.6;
      ao.configuration.color = new THREE.Color(0x4a3a2c);
      ao.setQualityMode("Medium");
      c.addPass(ao);
      // N8AO writes sRGB itself (gammaCorrection); an OutputPass after it
      // would convert twice and wash the colours out.
      c.setSize(size.w, size.h);
      composer = c;
    });

    const start = performance.now();
    return {
      camera: desk.camera,
      onResize: (w, h) => {
        size = { w, h };
        composer?.setSize(w, h);
      },
      onFrame: (time) => {
        desk.update(time - start, pointer.current);
        if (composer) composer.render();
        else renderer.render(desk.scene, desk.camera);
      },
    };
  });

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}
