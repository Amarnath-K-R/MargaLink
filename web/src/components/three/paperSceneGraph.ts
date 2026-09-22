import type * as THREE from "three";

function buildStage(THREE: typeof import("three")) {
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

  return { scene, camera, root };
}

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

function buildPaperGroup(THREE: typeof import("three")): THREE.Group {
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
  return paperGroup;
}

function buildAnalysisGroup(THREE: typeof import("three")): THREE.Group {
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
  return analysisGroup;
}

function buildReviewGroup(THREE: typeof import("three")): THREE.Group {
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

  return reviewGroup;
}

export function buildPaperScene(THREE: typeof import("three")) {
  const { scene, camera, root } = buildStage(THREE);

  const paperGroup = buildPaperGroup(THREE);
  root.add(paperGroup);

  const analysisGroup = buildAnalysisGroup(THREE);
  root.add(analysisGroup);

  const reviewGroup = buildReviewGroup(THREE);
  root.add(reviewGroup);

  return { scene, camera, paperGroup, analysisGroup, reviewGroup, root };
}
