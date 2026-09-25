import type * as THREE_NS from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// A clay-render desk, built in code: every object is rounded geometry in one
// matte material family tinted from MargaLink's palette, lit by a soft studio
// environment and one key light, sitting on a shadow-only ground so it rests
// on the page's own paper colour. Ambient occlusion (N8AO, in ClayDesk.tsx)
// adds the contact darkening that makes it read as clay.

type T = typeof THREE_NS;

export const CLAY = {
  paper: 0xf0efea,
  sheet: 0xfbf8f1,
  sand: 0xe7d9bd,
  wood: 0xe4c49a,
  teal: 0x2c5f6f,
  tealSoft: 0x6f98a2,
  tealPale: 0xb9d0d2,
  clay: 0xc27a5c,
  claySoft: 0xe3ad94,
  ink: 0x2a2f38,
  steel: 0xc9c6bd,
} as const;

export type Kind = "pencil" | "ruler" | "graph" | "stack" | "chart" | "notebook" | "plane" | "pin";
export type Placement = { kind: Kind; x: number; z: number; rotY?: number; scale?: number; lift?: number };
export type DeskLayout = { items: Placement[]; path: [number, number][]; camera: { x: number; y: number; z: number; lookX: number; lookZ: number; fov: number } };

function clay(THREE: T, color: number, roughness = 0.9) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) });
}

function canvasTexture(THREE: T, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function mesh(THREE: T, geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A face drawn on top of a flat object (ruler ticks, graph grid, ruled lines).
function topFace(THREE: T, w: number, d: number, y: number, tex: THREE_NS.Texture) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function pencil(THREE: T) {
  const g = new THREE.Group();
  const r = 0.17;
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const bodyLen = 3.4;
  const body = new THREE.ExtrudeGeometry(shape, { depth: bodyLen, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3 });
  body.translate(0, 0, -bodyLen / 2);
  body.rotateY(Math.PI / 2);
  g.add(mesh(THREE, body, clay(THREE, CLAY.teal, 0.85)));
  const wood = new THREE.ConeGeometry(r * 1.02, 0.62, 6, 1, false);
  wood.rotateZ(-Math.PI / 2);
  wood.translate(bodyLen / 2 + 0.31, 0, 0);
  g.add(mesh(THREE, wood, clay(THREE, CLAY.wood)));
  const lead = new THREE.ConeGeometry(0.06, 0.2, 16);
  lead.rotateZ(-Math.PI / 2);
  lead.translate(bodyLen / 2 + 0.53, 0, 0);
  g.add(mesh(THREE, lead, clay(THREE, CLAY.ink, 0.6)));
  const ferrule = new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.3, 24);
  ferrule.rotateZ(Math.PI / 2);
  ferrule.translate(-bodyLen / 2 - 0.15, 0, 0);
  g.add(mesh(THREE, ferrule, clay(THREE, CLAY.steel, 0.55)));
  const eraser = new THREE.CapsuleGeometry(r, 0.14, 6, 18);
  eraser.rotateZ(Math.PI / 2);
  eraser.translate(-bodyLen / 2 - 0.4, 0, 0);
  g.add(mesh(THREE, eraser, clay(THREE, CLAY.claySoft)));
  g.position.y = r;
  g.rotation.x = Math.PI / 6; // a flat face down
  return { group: g, tip: new THREE.Vector3(bodyLen / 2 + 0.63, 0, 0) };
}

function ruler(THREE: T) {
  const g = new THREE.Group();
  const w = 5.2, d = 0.72, h = 0.09;
  g.add(mesh(THREE, new RoundedBoxGeometry(w, h, d, 3, 0.035), clay(THREE, CLAY.sand)));
  const tex = canvasTexture(THREE, 2048, 284, (c) => {
    c.clearRect(0, 0, 2048, 284);
    c.strokeStyle = hex(CLAY.ink);
    c.fillStyle = hex(CLAY.ink);
    c.font = "500 34px 'IBM Plex Mono', monospace";
    const step = 2048 / 52;
    for (let i = 1; i < 52; i++) {
      const x = i * step;
      const len = i % 10 === 0 ? 110 : i % 5 === 0 ? 76 : 44;
      c.lineWidth = i % 10 === 0 ? 5 : 3;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, len);
      c.stroke();
      if (i % 10 === 0) c.fillText(String(i / 10), x - 9, 160);
    }
  });
  g.add(topFace(THREE, w - 0.08, d - 0.08, h / 2 + 0.002, tex));
  g.position.y = h / 2;
  return g;
}

function sheet(THREE: T, w: number, d: number, face: THREE_NS.Texture | null, color: number = CLAY.sheet) {
  const g = new THREE.Group();
  g.add(mesh(THREE, new RoundedBoxGeometry(w, 0.035, d, 2, 0.015), clay(THREE, color, 0.95)));
  if (face) g.add(topFace(THREE, w - 0.04, d - 0.04, 0.019, face));
  return g;
}

function graph(THREE: T) {
  const tex = canvasTexture(THREE, 1024, 1300, (c) => {
    c.fillStyle = hex(CLAY.sheet);
    c.fillRect(0, 0, 1024, 1300);
    for (let x = 0, i = 0; x <= 1024; x += 32, i++) {
      c.strokeStyle = i % 5 === 0 ? "rgba(44,95,111,.45)" : "rgba(44,95,111,.18)";
      c.lineWidth = i % 5 === 0 ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1300); c.stroke();
    }
    for (let y = 0, i = 0; y <= 1300; y += 32, i++) {
      c.strokeStyle = i % 5 === 0 ? "rgba(44,95,111,.45)" : "rgba(44,95,111,.18)";
      c.lineWidth = i % 5 === 0 ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(0, y); c.lineTo(1024, y); c.stroke();
    }
    // a hand-drawn trend line
    c.strokeStyle = hex(CLAY.clay);
    c.lineWidth = 7;
    c.lineCap = "round";
    c.beginPath();
    [[90, 1050], [260, 900], [420, 950], [580, 700], [760, 560], [930, 300]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  });
  const g = sheet(THREE, 3.2, 4.06, tex);
  g.position.y = 0.018;
  return g;
}

function ruledTexture(THREE: T) {
  return canvasTexture(THREE, 1024, 1300, (c) => {
    c.fillStyle = hex(CLAY.sheet);
    c.fillRect(0, 0, 1024, 1300);
    c.fillStyle = hex(CLAY.teal);
    c.fillRect(110, 140, 520, 26);
    c.fillStyle = "rgba(42,47,56,.28)";
    [230, 290, 350, 410, 520, 580, 640, 700, 760, 870, 930, 990].forEach((y, i) => c.fillRect(110, y, i % 4 === 3 ? 480 : 800, 12));
  });
}

function stack(THREE: T) {
  const g = new THREE.Group();
  const face = ruledTexture(THREE);
  [[0, 0, 0.12], [0.08, 0.04, -0.06], [-0.05, 0.08, 0.02]].forEach(([dx, dy, rot], i, all) => {
    const s = sheet(THREE, 3, 3.9, i === all.length - 1 ? face : null);
    s.position.set(dx, 0.02 + dy, dx * 0.6);
    s.rotation.y = rot;
    g.add(s);
  });
  return g;
}

function chart(THREE: T) {
  const g = new THREE.Group();
  const base = mesh(THREE, new RoundedBoxGeometry(2, 0.14, 1.2, 3, 0.05), clay(THREE, CLAY.sand));
  base.position.y = 0.07;
  g.add(base);
  const colors = [CLAY.tealPale, CLAY.tealSoft, CLAY.teal, CLAY.clay];
  [0.55, 0.95, 0.75, 1.35].forEach((h, i) => {
    const bar = mesh(THREE, new RoundedBoxGeometry(0.32, h, 0.32, 3, 0.07), clay(THREE, colors[i]));
    bar.position.set(-0.66 + i * 0.44, 0.14 + h / 2, 0);
    g.add(bar);
  });
  return g;
}

function notebook(THREE: T) {
  const g = new THREE.Group();
  const cover = mesh(THREE, new RoundedBoxGeometry(2.3, 0.3, 3.1, 4, 0.08), clay(THREE, CLAY.clay));
  cover.position.y = 0.15;
  g.add(cover);
  const pages = mesh(THREE, new RoundedBoxGeometry(2.2, 0.22, 3.0, 2, 0.04), clay(THREE, CLAY.sheet));
  pages.position.set(0.06, 0.15, 0);
  g.add(pages);
  const band = mesh(THREE, new RoundedBoxGeometry(0.12, 0.34, 3.14, 2, 0.04), clay(THREE, CLAY.ink, 0.7));
  band.position.set(0.72, 0.16, 0);
  g.add(band);
  return g;
}

function plane(THREE: T) {
  const v = new Float32Array([
    // left wing: nose, tail-centre, tail-left
    1, 0, 0, -0.9, 0, 0, -0.9, 0.05, 0.75,
    // right wing
    1, 0, 0, -0.9, 0.05, -0.75, -0.9, 0, 0,
    // keel
    1, 0, 0, -0.9, -0.28, 0, -0.9, 0, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const m = mesh(THREE, geo, new THREE.MeshPhysicalMaterial({ color: CLAY.sheet, roughness: 0.9, side: THREE.DoubleSide, sheen: 0.3 }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function pin(THREE: T) {
  const g = new THREE.Group();
  const head = mesh(THREE, new THREE.SphereGeometry(0.24, 32, 20), clay(THREE, CLAY.clay, 0.8));
  head.position.y = 0.95;
  g.add(head);
  const stem = mesh(THREE, new THREE.ConeGeometry(0.13, 0.75, 24), clay(THREE, CLAY.clay, 0.8));
  stem.rotation.x = Math.PI;
  stem.position.y = 0.5;
  g.add(stem);
  const ring = mesh(THREE, new THREE.TorusGeometry(0.34, 0.05, 12, 40), clay(THREE, CLAY.claySoft));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  return g;
}

const BUILD: Record<Exclude<Kind, "pencil">, (THREE: T) => THREE_NS.Group> = { ruler, graph, stack, chart, notebook, plane, pin };

export type Desk = {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  // Call every frame with ms since start and pointer in -1..1.
  update: (ms: number, pointer: { x: number; y: number }) => void;
};

export function buildDesk(THREE: T, renderer: THREE_NS.WebGLRenderer, layout: DeskLayout, reducedMotion: boolean): Desk {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CLAY.paper);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xd8cfbf, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e3, 2.0);
  key.position.set(-5, 11, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 20;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ color: 0x3a3226, opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { camera: cam } = layout;
  const camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 200);
  const look = new THREE.Vector3(cam.lookX, 0, cam.lookZ);

  type Item = { obj: THREE_NS.Object3D; baseY: number; delay: number; float: number; phase: number };
  const items: Item[] = [];
  let pencilTip: THREE_NS.Vector3 | null = null;
  layout.items.forEach((p, i) => {
    let obj: THREE_NS.Object3D;
    if (p.kind === "pencil") {
      const built = pencil(THREE);
      obj = new THREE.Group();
      obj.add(built.group);
      pencilTip = built.tip.clone();
    } else obj = BUILD[p.kind](THREE);
    obj.position.set(p.x, p.lift ?? 0, p.z);
    obj.rotation.y = p.rotY ?? 0;
    obj.scale.setScalar(p.scale ?? 1);
    if (p.kind === "plane") obj.rotation.z = 0.12;
    scene.add(obj);
    if (pencilTip && p.kind === "pencil") pencilTip.applyMatrix4(new THREE.Matrix4().compose(obj.position, obj.quaternion, obj.scale));
    items.push({ obj, baseY: obj.position.y, delay: i * 90, float: p.kind === "plane" ? 0.18 : 0, phase: i * 1.3 });
  });

  // The path: dashes laid along a curve on the desk, drawn in on load.
  const pts = layout.path.map(([x, z]) => new THREE.Vector3(x, 0.05, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const dashMat = clay(THREE, CLAY.teal, 0.8);
  const dashGeo = new THREE.CapsuleGeometry(0.055, 0.2, 4, 10);
  dashGeo.rotateZ(Math.PI / 2);
  const count = Math.floor(curve.getLength() / 0.42);
  const dashes: THREE_NS.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const d = mesh(THREE, dashGeo, dashMat);
    d.position.copy(curve.getPointAt(t));
    const tan = curve.getTangentAt(t);
    d.rotation.y = -Math.atan2(tan.z, tan.x);
    d.visible = reducedMotion;
    scene.add(d);
    dashes.push(d);
  }

  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const update = (ms: number, pointer: { x: number; y: number }) => {
    for (const it of items) {
      const drop = reducedMotion ? 1 : ease((ms - 200 - it.delay) / 900);
      const float = reducedMotion ? 0 : Math.sin(ms * 0.0012 + it.phase) * it.float;
      it.obj.position.y = it.baseY + (1 - drop) * 3 + float;
      it.obj.visible = drop > 0;
    }
    if (!reducedMotion) {
      const shown = Math.floor(ease((ms - 900) / 1600) * dashes.length);
      dashes.forEach((d, i) => (d.visible = i < shown));
    }
    const px = reducedMotion ? 0 : pointer.x * 0.6;
    const py = reducedMotion ? 0 : pointer.y * 0.35;
    camera.position.set(cam.x + px, cam.y + py, cam.z);
    camera.lookAt(look);
  };

  return { scene, camera, update };
}
