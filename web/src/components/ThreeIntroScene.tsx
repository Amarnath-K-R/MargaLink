"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

type ThreeIntroSceneProps = { onProgress?: (value: number) => void };

function makePaper(THREE: typeof import("three"), color: number, width: number, height: number) {
  const group = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.06),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }),
  );
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(paper.geometry),
    new THREE.LineBasicMaterial({ color: 0xb7b4ac, transparent: true, opacity: 0.5 }),
  );
  group.add(paper, outline);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x667077, transparent: true, opacity: 0.34 });
  [-0.62, -0.43, -0.24, -0.05, 0.14, 0.33, 0.52].forEach((y, index) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(width * (0.45 + (index % 3) * 0.11), 0.018), lineMaterial);
    line.position.set(-width * 0.08, y, 0.045);
    group.add(line);
  });
  const inkMark = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.52, 0.034),
    new THREE.MeshBasicMaterial({ color: 0x2c5f6f, transparent: true, opacity: 0.7 }),
  );
  inkMark.position.set(-width * 0.06, 0.72, 0.048);
  group.add(inkMark);
  return group;
}

function makeInkTrail(THREE: typeof import("three"), color: number, points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.52 }));
}

export default function ThreeIntroScene({ onProgress }: ThreeIntroSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

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
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0.2, 10.5);
      scene.add(new THREE.AmbientLight(0xf3eee4, 2));
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-4, 5, 8);
      scene.add(key);
      const blueLight = new THREE.PointLight(0x7fabb3, 2, 14);
      blueLight.position.set(3, -1, 5);
      scene.add(blueLight);

      const world = new THREE.Group();
      scene.add(world);
      const heroPaper = makePaper(THREE, 0xf8f5ee, 2.9, 3.7);
      heroPaper.position.set(0.15, 0, 0);
      heroPaper.rotation.set(0.02, -0.2, -0.08);
      world.add(heroPaper);

      const sidePaper = makePaper(THREE, 0xe6e4dc, 1.7, 2.25);
      sidePaper.position.set(-2.3, 1.25, -0.65);
      sidePaper.rotation.set(-0.15, 0.3, 0.18);
      world.add(sidePaper);
      const lowerPaper = makePaper(THREE, 0xe6e4dc, 1.95, 2.55);
      lowerPaper.position.set(2.2, -1.25, -0.35);
      lowerPaper.rotation.set(0.12, -0.26, -0.25);
      world.add(lowerPaper);

      const inkGroup = new THREE.Group();
      inkGroup.add(
        makeInkTrail(THREE, 0x2c5f6f, [
          new THREE.Vector3(-4.2, -1.9, 0.4),
          new THREE.Vector3(-2.6, -1.35, 0.6),
          new THREE.Vector3(-1.1, -1.65, 0.8),
          new THREE.Vector3(0.8, -1.15, 0.75),
          new THREE.Vector3(2.8, -1.4, 0.5),
          new THREE.Vector3(4.4, -0.7, 0.3),
        ]),
        makeInkTrail(THREE, 0x565b66, [
          new THREE.Vector3(-4.5, 1.8, -0.2),
          new THREE.Vector3(-3.3, 1.2, 0.1),
          new THREE.Vector3(-2.3, 1.55, 0.4),
          new THREE.Vector3(-0.8, 1.15, 0.6),
          new THREE.Vector3(1.3, 1.55, 0.3),
          new THREE.Vector3(3.8, 1.1, 0.1),
        ]),
      );
      world.add(inkGroup);

      const inkDots = new THREE.Group();
      for (let index = 0; index < 24; index += 1) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(index % 5 === 0 ? 0.055 : 0.028, 10, 8),
          new THREE.MeshBasicMaterial({ color: index % 5 === 0 ? 0x2c5f6f : 0x8aa5aa, transparent: true, opacity: 0.55 }),
        );
        const angle = (index / 24) * Math.PI * 2;
        const radius = 2.4 + (index % 4) * 0.28;
        dot.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, -0.1 + (index % 3) * 0.08);
        inkDots.add(dot);
      }
      world.add(inkDots);

      const resize = () => {
        const width = mount.clientWidth || window.innerWidth;
        const height = mount.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        camera.position.z = width < 680 ? 12.5 : 10.5;
      };
      resize();
      window.addEventListener("resize", resize);

      const started = performance.now();
      let raf = 0;
      const render = (time: number) => {
        const elapsed = time - started;
        const progress = Math.min(1, elapsed / 8000);
        const ease = progress * progress * (3 - 2 * progress);
        const handoff = Math.min(1, Math.max(0, (progress - 0.78) / 0.22));
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
        world.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.material) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            material.transparent = true;
            material.opacity *= 1 - handoff;
          });
        });
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

  return <div ref={mountRef} className="intro-three-scene" />;
}
