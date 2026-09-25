"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useThreeCanvas } from "@/components/three/useThreeCanvas";
import { buildDesk, type DeskLayout } from "@/components/three/clayDesk";

// The clay desk as a full-bleed canvas: scene from clayDesk.ts, rendered
// through N8AO (soft, warm-tinted ambient occlusion — the contact darkening
// that sells the clay look), written straight to the screen.
// `active` false skips rendering (e.g. once the landing has scrolled away).
// `narrowLayout`, if given, is used below 760px wide (chosen once, at mount).
export default function ClayDesk({
  layout,
  narrowLayout,
  className,
  style,
  active = true,
}: {
  layout: DeskLayout;
  narrowLayout?: DeskLayout;
  className?: string;
  style?: CSSProperties;
  active?: boolean;
}) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const mountRef = useThreeCanvas((THREE, _mount, renderer) => {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = narrowLayout && window.innerWidth < 760;
    const desk = buildDesk(THREE, renderer, narrow ? narrowLayout : layout, reduced);

    type Composer = { render: () => void; setSize: (w: number, h: number) => void };
    let composer: Composer | null = null;
    let size = { w: 1, h: 1 };
    // Post-processing loads async; frames before it's ready render directly.
    void Promise.all([
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
        if (!activeRef.current) return;
        // Held (floating) while the homepage intro plays over it.
        desk.update(time - start, !!document.querySelector(".intro-overlay:not(.intro-fade)"));
        if (composer) composer.render();
        else renderer.render(desk.scene, desk.camera);
      },
    };
  });

  return <div ref={mountRef} className={className} style={style} aria-hidden="true" />;
}
