"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { clamp01, between, lerp } from "@/lib/easing";
import { setOpacity } from "@/components/three/sceneHelpers";

type ThreePaperSceneProps = {
  progress: number;
  heroProgress: number;
  reducedMotion: boolean;
};

function addPaperLines(THREE: typeof import("three"), group: THREE.Group) {
  const ink = new THREE.MeshBasicMaterial({ color: 0x565b66, transparent: true, opacity: 0.32 });
  const accent = new THREE.MeshBasicMaterial({ color: 0x2c5f6f, transparent: true, opacity: 0.62 });
  const lineData = [
    [0.7, 0.022, -0.8, 0.92, ink],
    [0.7, 0.022, -0.66, 0.64, ink],
    [0.92, 0.035, -0.35, 0.92, accent],
    [0.84, 0.018, -0.2, 0.84, ink],
    [0.84, 0.018, -0.08, 0.84, ink],
    [0.78, 0.018, 0.04, 0.78, ink],
    [0.68, 0.018, 0.32, 0.9, ink],
    [0.7, 0.018, 0.44, 0.82, ink],
    [0.6, 0.018, 0.56, 0.72, ink],
  ] as const;

  lineData.forEach(([width, height, y, xScale, material]) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width * xScale, height), material);
    line.position.set(-0.05 - (1 - xScale) * 0.22, y, 0.071);
    group.add(line);
  });

  const pageNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.018),
    new THREE.MeshBasicMaterial({ color: 0x565b66, transparent: true, opacity: 0.3 }),
  );
  pageNumber.position.set(0.78, -1.32, 0.071);
  group.add(pageNumber);
}

function makeScene(THREE: typeof import("three")) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.1, 11);

  scene.add(new THREE.AmbientLight(0xf3eee4, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(-4, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9ebac0, 1.6);
  rimLight.position.set(6, -2, 4);
  scene.add(rimLight);

  const root = new THREE.Group();
  scene.add(root);

  const paperGroup = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 3.12, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.9, metalness: 0.02 }),
  );
  paperGroup.add(paper);
  paperGroup.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(paper.geometry),
      new THREE.LineBasicMaterial({ color: 0xaaa79e, transparent: true, opacity: 0.64 }),
    ),
  );
  addPaperLines(THREE, paperGroup);
  root.add(paperGroup);

  const analysisGroup = new THREE.Group();
  const boundary = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.04, 96),
    new THREE.MeshBasicMaterial({ color: 0x2c5f6f, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  const boundaryInner = new THREE.Mesh(
    new THREE.RingGeometry(2.18, 2.195, 96),
    new THREE.MeshBasicMaterial({ color: 0x9bb1b4, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  analysisGroup.add(boundary, boundaryInner);

  const nodePositions = [
    [-1.55, 1.02],
    [-0.72, 1.58],
    [0.2, 1.22],
    [1.35, 0.8],
    [0.92, -0.25],
    [0.12, -1.18],
    [-1.15, -0.72],
  ];
  const nodes = new THREE.Group();
  nodePositions.forEach(([x, y], index) => {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(index === 2 ? 0.105 : 0.075, 18, 12),
      new THREE.MeshBasicMaterial({ color: index === 2 ? 0x2c5f6f : 0x8aa5aa, transparent: true, opacity: 0.9 }),
    );
    node.position.set(x, y, 0.06);
    nodes.add(node);
  });
  const edgeGeometry = new THREE.BufferGeometry().setFromPoints(
    nodePositions.flatMap(([x, y], index) => {
      const next = nodePositions[(index + 1) % nodePositions.length];
      return [new THREE.Vector3(x, y, 0.02), new THREE.Vector3(next[0], next[1], 0.02)];
    }),
  );
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x8aa5aa, transparent: true, opacity: 0.28 }),
  );
  analysisGroup.add(edges, nodes);
  root.add(analysisGroup);

  const reviewGroup = new THREE.Group();
  reviewGroup.position.set(1.35, 0.12, 0);
  const reviewPanel = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.82, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.82, metalness: 0 }),
  );
  reviewGroup.add(reviewPanel);
  reviewGroup.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(reviewPanel.geometry),
      new THREE.LineBasicMaterial({ color: 0xaaa79e, transparent: true, opacity: 0.64 }),
    ),
  );

  const gate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, 2.8),
    new THREE.MeshBasicMaterial({ color: 0xa15a3f, transparent: true, opacity: 0.9 }),
  );
  gate.position.set(-1.22, 0, 0.08);
  reviewGroup.add(gate);

  const reviewTitle = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x2c5f6f, transparent: true, opacity: 0.86 }),
  );
  reviewTitle.position.set(-0.28, 0.95, 0.06);
  reviewGroup.add(reviewTitle);

  [-0.25, -0.72, -1.19].forEach((y, index) => {
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(1.55 - index * 0.12, 0.25, 0.04),
      new THREE.MeshStandardMaterial({ color: index === 1 ? 0xd4dddd : 0xf3f0e9, roughness: 0.85 }),
    );
    tier.position.set(-0.12, y, 0.06);
    reviewGroup.add(tier);
  });
  root.add(reviewGroup);

  return { scene, camera, paperGroup, analysisGroup, reviewGroup, root };
}

export default function ThreePaperScene({ progress, heroProgress, reducedMotion }: ThreePaperSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
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

      const { scene, camera, paperGroup, analysisGroup, reviewGroup, root } = makeScene(THREE);

      // Base camera framing per viewport width; scroll-driven panning (below) is
      // layered on top of these, not a replacement for them.
      let baseX = 0;
      let baseY = 0;
      let baseZ = 11;

      const resize = () => {
        const width = mount.clientWidth || window.innerWidth;
        const height = mount.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        baseX = width < 760 ? 0 : width < 1100 ? 0.35 : 0.85;
        baseY = width < 760 ? 0.15 : 0.1;
        baseZ = width < 760 ? 12.8 : 11;
      };
      resize();
      window.addEventListener("resize", resize);

      let raf = 0;
      const render = (time: number) => {
        const scrollProgress = progressRef.current;
        const heroScroll = heroProgressRef.current;
        const rm = reducedMotionRef.current;
        const width = mount.clientWidth || window.innerWidth;
        const mobile = width < 760;
        const driftScale = rm ? 0 : 1;
        const drift = time * 0.00035;

        const paperTravel = between(scrollProgress, 0.08, 0.4);
        const heroPaperProgress = Math.max(heroScroll, paperTravel);

        const analysisIn = between(scrollProgress, 0.42, 0.52);
        const analysisOut = between(scrollProgress, 0.58, 0.68);
        const reviewIn = between(scrollProgress, 0.58, 0.7);
        const finalEase = between(scrollProgress, 0.85, 1);

        const paperReveal = between(heroPaperProgress, 0.06, 0.22);
        const paperExit = between(scrollProgress, 0.32, 0.55);
        paperGroup.position.x = mobile
          ? lerp(1.5, -0.72, heroPaperProgress) - paperExit * 0.18
          : lerp(2.4, -0.72, heroPaperProgress) - paperExit * 0.42;
        paperGroup.position.y =
          lerp(0.28, 0.08, heroPaperProgress) + Math.sin(drift) * 0.04 * driftScale + paperExit * 0.08;
        paperGroup.rotation.y =
          lerp(-0.62, -0.08, between(heroPaperProgress, 0.14, 0.42)) +
          Math.PI * between(heroPaperProgress, 0.38, 0.58) -
          paperExit * 0.08;
        paperGroup.rotation.z = lerp(-0.12, -0.035, heroPaperProgress) + Math.sin(drift * 0.9) * 0.01 * driftScale;
        paperGroup.scale.setScalar((mobile ? 0.82 : 1) * lerp(1, 0.9, paperExit));
        setOpacity(paperGroup, clamp01(Math.max(paperReveal, 0.86 - paperExit * 0.64)));

        analysisGroup.position.x = mobile ? 0 : -0.32;
        analysisGroup.position.y = 0.06 + Math.sin(drift * 0.7) * 0.05 * driftScale;
        analysisGroup.rotation.z = drift * 0.18 * driftScale;
        analysisGroup.scale.setScalar(mobile ? 0.72 : 0.92);
        setOpacity(analysisGroup, clamp01(analysisIn * (1 - analysisOut)));

        reviewGroup.position.x = mobile ? 0.55 : 1.22;
        reviewGroup.position.y = 0.1 + Math.sin(drift * 0.75) * 0.04 * driftScale;
        reviewGroup.rotation.y = 0.08 * between(scrollProgress, 0.58, 0.9);
        reviewGroup.scale.setScalar(mobile ? 0.78 : 0.96);
        setOpacity(reviewGroup, clamp01(reviewIn * (1 - finalEase * 0.55)));

        root.rotation.y = Math.sin(drift * 0.32) * 0.018 * driftScale;

        // Scroll-driven camera pan: a genuine viewpoint drift layered on top of the
        // per-object motion above, giving each section its own vantage rather than a
        // static observer. Frozen at the responsive base framing under reduced motion.
        if (rm) {
          camera.position.set(baseX, baseY, baseZ);
          camera.lookAt(0, 0, 0);
        } else {
          const panJournals = between(scrollProgress, 0.22, 0.38);
          const panMatching = between(scrollProgress, 0.4, 0.53);
          const panReview = between(scrollProgress, 0.56, 0.7);
          const panPrivacy = between(scrollProgress, 0.72, 0.86);
          const panFinal = between(scrollProgress, 0.86, 1);

          camera.position.x =
            baseX - panJournals * 0.5 + panMatching * 0.35 - panReview * 0.25 + panPrivacy * 0.12;
          camera.position.y = baseY - panMatching * 0.12 + panReview * 0.16 - panFinal * 0.08;
          camera.position.z =
            baseZ - panMatching * 1.3 + panReview * 1.7 + panPrivacy * 1.1 - panFinal * 1.6;
          camera.lookAt(panReview * 0.35 - panFinal * 0.2, panReview * 0.12 - panFinal * 0.1, 0);
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);

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
  }, []);

  return <div ref={mountRef} className="three-scene" />;
}
