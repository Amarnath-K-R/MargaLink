"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

export type ThreeSceneSetup = {
  camera: THREE.PerspectiveCamera;
  // Scene-specific resize handling beyond the generic aspect/projection
  // update below (e.g. repositioning the camera for a narrower viewport).
  onResize?: (width: number, height: number) => void;
  onFrame: (time: number) => void;
};

// The setup/cleanup preamble shared by ThreePaperScene and ThreeIntroScene
// — byte-identical between the two before this extraction (that
// duplication is exactly how setOpacity and its intro-scene cousin
// diverged before Phase 5 reunified them into sceneHelpers.ts). `build`
// receives the loaded THREE module, the mount element, and the
// already-configured renderer, and returns per-frame/per-resize
// callbacks; this hook owns everything generic: mounting, the WebGL
// try/catch, the resize listener (including the aspect/projection update
// every scene needs), the rAF loop, and teardown.
export function useThreeCanvas(
  build: (THREE: typeof import("three"), mount: HTMLDivElement, renderer: THREE.WebGLRenderer) => ThreeSceneSetup,
) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup = () => {};

    import("three").then((THREE) => {
      if (disposed || !mount) return;

      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      mount.appendChild(canvas);

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      } catch {
        mount.removeChild(canvas);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      // Effect deps are intentionally [] — like the rest of this hook, this
      // runs once at mount and reads live values via refs (progressRef and
      // friends in the callers), the same pattern the pre-split scene
      // components already used. `build` itself is a fresh closure every
      // render, but only the one from whichever render this effect actually
      // fires on ever executes — see react-hooks/exhaustive-deps below.
      const { camera, onResize, onFrame } = build(THREE, mount, renderer);

      const resize = () => {
        const width = mount.clientWidth || window.innerWidth;
        const height = mount.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        onResize?.(width, height);
      };
      resize();
      window.addEventListener("resize", resize);

      let raf = 0;
      const loop = (time: number) => {
        onFrame(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        renderer.dispose();
        mount.removeChild(canvas);
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
    // `build` is deliberately excluded: this effect mounts the canvas once
    // and never re-runs (same as the pre-split scene components), reading
    // every reactive value through refs inside the callbacks build()
    // returns rather than by closing over props directly — so an unstable
    // `build` identity across renders is harmless here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mountRef;
}
