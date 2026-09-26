import type * as THREE_NS from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PAPER_PARTS, PAPER_TOTAL, TYPE_CHARS_PER_SECOND, type PaperPartKey } from "./paperText.ts";
import { buildBook } from "./book.ts";
import { BOOK_TIMING } from "./bookSpreads.ts";

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
export type DeskLayout = {
  items: Placement[];
  path: [number, number][];
  camera: { x: number; y: number; z: number; lookX: number; lookZ: number; fov: number };
  // The closing section's paper, relative to the camera once that section has
  // arrived: it lies on the desk just below the landing, stands up to face
  // the reader as the section arrives, writes itself, and a pin drops onto
  // it. The path winds from the landing's pin to it, then on past the two
  // beats to the tools book. Without it the camera doesn't pan (phones).
  paperTo?: { x: number; y: number; z: number; scale: number };
};

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
// `unlit`: shown in its true colours (the self-writing page, which is read).
function topFace(THREE: T, w: number, d: number, y: number, tex: THREE_NS.Texture, unlit = false) {
  const mat = unlit ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
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

function sheet(THREE: T, w: number, d: number, face: THREE_NS.Texture | null, color: number = CLAY.sheet, unlit = false) {
  const g = new THREE.Group();
  g.add(mesh(THREE, new RoundedBoxGeometry(w, 0.035, d, 2, 0.015), clay(THREE, color, 0.95)));
  if (face) g.add(topFace(THREE, w - 0.04, d - 0.04, 0.019, face, unlit));
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

// The paper stack's top sheet is a page that can write itself. It is laid out
// as the finished manuscript from the start (PAPER_PARTS): until a line is
// typed it shows as a placeholder bar — teal for the title, grey for text —
// so on the desk it reads as a ruled sheet, and when writing starts each
// line's text replaces its own bar, left to right, with a caret following.
// Drawn at ~3x its on-screen size, in the page's own Plex fonts.
type WritablePaper = { texture: THREE_NS.CanvasTexture; draw: (typed: number, caret: boolean) => void };
function writablePaper(THREE: T): WritablePaper {
  const W = 1536, H = 1996, M = 140, TEXT_W = W - 2 * M;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue("--font-serif").trim() || "Georgia, serif";
  const sans = css.getPropertyValue("--font-sans").trim() || "system-ui, sans-serif";
  const STYLE: Record<PaperPartKey, { font: string; lh: number; gap: number; color: string; bar: string }> = {
    title: { font: `500 100px ${serif}`, lh: 116, gap: 0, color: hex(CLAY.ink), bar: hex(CLAY.teal) },
    authors: { font: `400 54px ${sans}`, lh: 72, gap: 56, color: hex(CLAY.ink), bar: "rgba(42,47,56,.26)" },
    affil: { font: `400 42px ${sans}`, lh: 60, gap: 8, color: "#565b66", bar: "rgba(42,47,56,.18)" },
    label: { font: `600 48px ${sans}`, lh: 68, gap: 88, color: hex(CLAY.teal), bar: "rgba(44,95,111,.45)" },
    abstract: { font: `400 52px ${sans}`, lh: 84, gap: 12, color: hex(CLAY.ink), bar: "rgba(42,47,56,.24)" },
    keywords: { font: `400 44px ${sans}`, lh: 66, gap: 54, color: "#565b66", bar: "rgba(42,47,56,.18)" },
  };
  type Line = { key: PaperPartKey; text: string; y: number; start: number };
  let lines: Line[] = [];
  let ruleY = 0;
  const layout = () => {
    lines = [];
    let y = 170;
    let start = 0;
    for (const part of PAPER_PARTS) {
      const st = STYLE[part.key];
      c.font = st.font;
      y += st.gap;
      const words = part.text.split(" ");
      let line = "";
      let lineStart = start;
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (line && c.measureText(next).width > TEXT_W) {
          y += st.lh;
          lines.push({ key: part.key, text: line, y, start: lineStart });
          lineStart += line.length + 1;
          line = w;
        } else line = next;
      }
      y += st.lh;
      lines.push({ key: part.key, text: line, y, start: lineStart });
      start += part.text.length;
      if (part.key === "affil") ruleY = y + 40;
    }
  };
  let last = "";
  let now = { typed: 0, caret: false };
  const draw = (typed: number, caret: boolean) => {
    now = { typed, caret };
    const sig = `${typed}|${caret}|${lines.length}`;
    if (sig === last) return;
    last = sig;
    if (!lines.length) layout();
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, W, H);
    c.fillStyle = hex(CLAY.teal);
    c.fillRect(M, ruleY, TEXT_W, 5);
    let caretAt: { x: number; y: number; h: number } | null = null;
    for (const ln of lines) {
      const st = STYLE[ln.key];
      c.font = st.font;
      const size = parseInt(st.font.split(" ")[1], 10);
      const n = Math.max(0, Math.min(ln.text.length, typed - ln.start));
      const done = c.measureText(ln.text.slice(0, n)).width;
      const full = c.measureText(ln.text).width;
      if (n > 0) {
        c.fillStyle = st.color;
        c.fillText(ln.text.slice(0, n), M, ln.y);
      }
      if (n < ln.text.length) {
        // the rest of the line is still a placeholder bar
        const barH = ln.key === "title" ? size * 0.34 : size * 0.3;
        c.fillStyle = st.bar;
        c.fillRect(M + done + (n > 0 ? size * 0.25 : 0), ln.y - size * 0.34 - barH / 2, Math.max(0, full - done - (n > 0 ? size * 0.25 : 0)), barH);
      }
      if (typed > ln.start && typed <= ln.start + ln.text.length) caretAt = { x: M + done + 4, y: ln.y, h: size };
    }
    if (caret && caretAt) {
      c.fillStyle = hex(CLAY.teal);
      c.fillRect(caretAt.x, caretAt.y - caretAt.h * 0.82, 6, caretAt.h * 1.02);
    }
    texture.needsUpdate = true;
  };
  draw(0, false);
  // Line breaks and placeholder widths come from the real fonts once they're
  // loaded: lay out again and redraw as it stands.
  void document.fonts?.ready.then(() => {
    lines = [];
    last = "";
    draw(now.typed, now.caret);
  });
  return { texture, draw };
}

// A soft, blurred rectangle: the drop shadow that lifts the written top sheet
// off the ones below it (independent of the light, so it holds when the paper
// turns to face the reader).
function dropShadow(THREE: T, w: number, d: number) {
  const S = 256, pad = 40;
  const tex = canvasTexture(THREE, S, S, (c) => {
    c.clearRect(0, 0, S, S);
    // draw the rect off-canvas and keep only its blurred shadow
    c.shadowColor = "rgba(58,44,28,.72)";
    c.shadowBlur = 26;
    c.shadowOffsetX = S * 2;
    c.fillStyle = "#000";
    c.fillRect(pad - S * 2, pad, S - 2 * pad, S - 2 * pad);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * (S / (S - 2 * 40)), d * (S / (S - 2 * 40))),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function stack(THREE: T, face: THREE_NS.Texture) {
  const g = new THREE.Group();
  [[0, 0, 0.12], [0.08, 0.04, -0.06], [-0.05, 0.08, 0.02]].forEach(([dx, dy, rot], i, all) => {
    const top = i === all.length - 1;
    // All white; each sheet casts its own soft shadow down-right onto the
    // one below (the bottom one onto the desk), so every sheet reads apart.
    const s = sheet(THREE, 3, 3.9, top ? face : null, 0xffffff, true);
    s.position.set(dx, 0.02 + dy, dx * 0.6);
    s.rotation.y = rot;
    const sh = dropShadow(THREE, 3, 3.9);
    sh.position.set(0.14, -0.02, 0.2);
    s.add(sh);
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


// ---- Scroll props: small desk scenes along the path's off-screen stretch ----
type Prop = { obj: THREE_NS.Group; z: number; shownAt: number | null; tick: (ms: number, inT: number, pass: number, still: boolean) => void };
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const bounce = (t: number) => (t >= 1 ? 1 : 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) * (1 - t));

function books(THREE: T) {
  const g = new THREE.Group();
  const specs: [number, number, number, number][] = [
    [CLAY.teal, 2.2, 0.34, 0.05],
    [CLAY.clay, 2.0, 0.3, -0.12],
    [CLAY.sand, 2.1, 0.32, 0.1],
  ];
  let y = 0;
  for (const [color, w, h, rot] of specs) {
    const b = mesh(THREE, new RoundedBoxGeometry(w, h, 1.5, 3, 0.06), clay(THREE, color));
    b.position.y = y + h / 2;
    b.rotation.y = rot;
    g.add(b);
    const pages = mesh(THREE, new RoundedBoxGeometry(w - 0.08, h * 0.7, 1.42, 2, 0.03), clay(THREE, CLAY.sheet));
    pages.position.set(0.06, y + h / 2, 0);
    pages.rotation.y = rot;
    g.add(pages);
    y += h;
  }
  const ribbon = mesh(THREE, new THREE.BoxGeometry(0.08, 0.02, 0.9), clay(THREE, CLAY.clay));
  ribbon.position.set(0.5, y + 0.01, 0.9);
  g.add(ribbon);
  return g;
}

function mug(THREE: T) {
  const g = new THREE.Group();
  const body = mesh(THREE, new THREE.CylinderGeometry(0.55, 0.5, 1.1, 40), clay(THREE, CLAY.teal));
  body.position.y = 0.55;
  g.add(body);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.47, 32), clay(THREE, 0x5b3a26, 0.6));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 1.02;
  g.add(coffee);
  const handle = mesh(THREE, new THREE.TorusGeometry(0.3, 0.08, 12, 28), clay(THREE, CLAY.teal));
  handle.position.set(0.62, 0.58, 0);
  g.add(handle);
  const steam: THREE_NS.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 1 }));
    g.add(m);
    steam.push(m);
  }
  g.userData.steam = steam;
  return g;
}

function notes(THREE: T) {
  const g = new THREE.Group();
  const cols = [CLAY.tealPale, CLAY.claySoft, CLAY.sand];
  cols.forEach((c, i) => {
    const pivot = new THREE.Group(); // hinged at the note's far edge, so it peels up
    pivot.position.set(i * 0.35 - 0.35, 0.015 + i * 0.012, -0.5 + i * 0.2);
    pivot.rotation.y = (i - 1) * 0.25;
    const n = mesh(THREE, new RoundedBoxGeometry(1, 0.02, 1, 2, 0.008), clay(THREE, c, 0.95));
    n.position.z = 0.5;
    pivot.add(n);
    g.add(pivot);
  });
  return g;
}

function magnifier(THREE: T) {
  const g = new THREE.Group();
  const rim = mesh(THREE, new THREE.TorusGeometry(0.6, 0.09, 16, 48), clay(THREE, CLAY.ink, 0.6));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.1;
  g.add(rim);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.58, 40), new THREE.MeshPhysicalMaterial({ color: 0xd8e6ea, transparent: true, opacity: 0.35, roughness: 0.1 }));
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.1;
  g.add(glass);
  const handle = mesh(THREE, new THREE.CapsuleGeometry(0.1, 1.1, 6, 12), clay(THREE, CLAY.clay));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(1.25, 0.1, 0);
  g.add(handle);
  return g;
}

function eraser(THREE: T) {
  const g = new THREE.Group();
  const e = mesh(THREE, new RoundedBoxGeometry(0.9, 0.3, 0.45, 3, 0.1), clay(THREE, CLAY.claySoft));
  e.position.y = 0.15;
  g.add(e);
  const band = mesh(THREE, new RoundedBoxGeometry(0.35, 0.32, 0.47, 2, 0.05), clay(THREE, CLAY.tealSoft));
  band.position.set(-0.2, 0.15, 0);
  g.add(band);
  return g;
}

function pencilCup(THREE: T) {
  const g = new THREE.Group();
  const cup = mesh(THREE, new THREE.CylinderGeometry(0.5, 0.44, 1.2, 36, 1, true), clay(THREE, CLAY.clay));
  (cup.material as THREE_NS.MeshPhysicalMaterial).side = THREE.DoubleSide;
  cup.position.y = 0.6;
  g.add(cup);
  const base = mesh(THREE, new THREE.CylinderGeometry(0.44, 0.44, 0.06, 36), clay(THREE, CLAY.clay));
  base.position.y = 0.03;
  g.add(base);
  const cols = [CLAY.teal, CLAY.sand, CLAY.tealSoft, CLAY.ink];
  cols.forEach((c, i) => {
    const p = mesh(THREE, new THREE.CylinderGeometry(0.07, 0.07, 1.9, 6), clay(THREE, c));
    const a = (i / cols.length) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.2, 1.1, Math.sin(a) * 0.2);
    p.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
    g.add(p);
    const tip = mesh(THREE, new THREE.ConeGeometry(0.07, 0.2, 6), clay(THREE, CLAY.wood));
    tip.position.y = 1.05;
    p.add(tip);
  });
  return g;
}

function stamp(THREE: T) {
  const g = new THREE.Group();
  const mark = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshBasicMaterial({ color: CLAY.clay, transparent: true, opacity: 0 }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.012;
  g.add(mark);
  const body = new THREE.Group();
  const pad = mesh(THREE, new RoundedBoxGeometry(1.2, 0.28, 1.2, 3, 0.08), clay(THREE, CLAY.teal));
  pad.position.y = 0.14;
  body.add(pad);
  const stem = mesh(THREE, new THREE.CylinderGeometry(0.16, 0.2, 0.7, 20), clay(THREE, CLAY.sand));
  stem.position.y = 0.6;
  body.add(stem);
  const knob = mesh(THREE, new THREE.SphereGeometry(0.34, 24, 16), clay(THREE, CLAY.clay));
  knob.position.y = 1.08;
  body.add(knob);
  g.add(body);
  g.userData.body = body;
  g.userData.mark = mark;
  return g;
}

// Placed across the stretch [zA, zB] on both sides of the view's centre,
// clear of the middle lane the path runs down.
function buildProps(THREE: T, zA: number, zB: number): Prop[] {
  const at = (f: number) => zA + (zB - zA) * f;
  const out: Prop[] = [];
  const place = (obj: THREE_NS.Group, x: number, z: number, rotY: number, scale: number, tick: Prop["tick"]) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = rotY;
    obj.scale.setScalar(scale * 1.6);
    obj.visible = false;
    out.push({ obj, z, shownAt: null, tick });
  };
  // books: drop in with a bounce
  {
    const o = books(THREE);
    place(o, -4.4, at(0.02), 0.35, 1, (_ms, inT) => (o.position.y = (1 - bounce(inT)) * 3));
  }
  // mug: drops in, steam rises
  {
    const o = mug(THREE);
    const steam = o.userData.steam as THREE_NS.Mesh[];
    place(o, 2.4, at(0.8), -0.4, 1, (ms, inT, _p, still) => {
      o.position.y = (1 - bounce(inT)) * 3;
      steam.forEach((m, i) => {
        const t = still ? 0.4 : ((ms / 2200 + i / 3) % 1);
        m.position.set(Math.sin(t * 6 + i) * 0.12, 1.2 + t * 1.3, 0);
        m.scale.setScalar(0.6 + t * 1.1);
        (m.material as THREE_NS.MeshStandardMaterial).opacity = inT * 0.45 * Math.sin(t * Math.PI);
      });
    });
  }
  // sticky notes: drop, then the top one peels up as the view passes
  {
    const o = notes(THREE);
    const top = o.children[o.children.length - 1];
    place(o, -3.6, at(0.36), 0.2, 1.1, (_ms, inT, pass, still) => {
      o.position.y = (1 - bounce(inT)) * 2.5;
      top.rotation.x = still ? -0.4 : -0.9 * Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, (pass + 0.6) * 1.6))));
    });
  }
  // magnifying glass: slides across the desk as the view passes
  {
    const o = magnifier(THREE);
    const x0 = 5;
    place(o, x0, at(1.02), 0.6, 1.1, (_ms, inT, pass, still) => {
      o.position.y = (1 - bounce(inT)) * 2.5;
      const s = still ? 0 : Math.max(-1, Math.min(1, pass));
      o.position.x = x0 - s * 1.2;
      o.rotation.y = 0.6 + s * 0.5;
    });
  }
  // eraser: rolls a turn as it lands
  {
    const o = eraser(THREE);
    place(o, -2.4, at(0.22), -0.3, 1, (_ms, inT) => {
      o.position.y = (1 - bounce(inT)) * 2.5;
      o.rotation.z = (1 - inT) * Math.PI * 2;
    });
  }
  // pencil cup: the lower left of the second beat
  {
    const o = pencilCup(THREE);
    place(o, -6.1, at(1.5), 0.3, 0.85, (_ms, inT) => (o.position.y = (1 - bounce(inT)) * 3));
  }
  // rubber stamp: thumps down every couple of seconds, leaving its mark
  {
    const o = stamp(THREE);
    const body = o.userData.body as THREE_NS.Group;
    const mark = o.userData.mark as THREE_NS.Mesh;
    place(o, 3.2, at(1.45), -0.2, 1, (ms, inT, _p, still) => {
      o.position.y = (1 - bounce(inT)) * 3;
      const t = still ? 0.9 : (ms % 2400) / 2400;
      const lift = t < 0.7 ? smoothstep(t / 0.7) * 0.9 : (1 - (t - 0.7) / 0.3) ** 2 * 0.9;
      body.position.y = lift;
      (mark.material as THREE_NS.MeshBasicMaterial).opacity = inT * 0.55;
    });
  }
  // paper plane: glides across the view over the middle of the stretch
  {
    const o = plane(THREE);
    const zMid = at(0.5);
    place(o, 0, zMid, 0, 0.9, (ms, _inT, pass, still) => {
      const t = still ? 0.5 : Math.max(0, Math.min(1, (pass + 1.2) / 2.6));
      o.visible = still || (t > 0 && t < 1);
      o.position.set(-9 + 18 * t, 2.6 + Math.sin(t * Math.PI) * 0.8 + Math.sin(ms * 0.003) * 0.08, zMid + 1.5 - 3 * t);
      o.rotation.set(0, Math.atan2(3, 18), 0.15 * Math.sin(ms * 0.002));
    });
  }
  return out;
}

const BUILD: Record<Exclude<Kind, "pencil" | "stack">, (THREE: T) => THREE_NS.Group> = { ruler, graph, chart, notebook, plane, pin };

// The page's scroll, px, and two pinned (sticky) stretches of the page, each
// its top on the page and its height: `paper`, the closing section right
// after the landing — its paper stands up as it arrives and writes itself
// while it holds — and `book`, the tools book after the two beats, whose
// pages turn while it holds. `finale`: the last section, holding while its
// manuscript is stamped ready and takes off. While any holds, so does the desk.
type Span = { top: number; height: number };
export type DeskScroll = { y: number; vh: number; paper: Span; book: Span; finale: Span };

export type Desk = {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  // `scroll` pans the camera down the desk at the page's own speed — see
  // DeskLayout.paperTo — holding over the book while its section is pinned.
  // Call every frame with ms since start. While `hold`
  // is true (the homepage intro), the objects float and tumble above the desk
  // with the camera close in; when it turns false they fall into place, the
  // camera eases back and the path draws — the intro becoming the landing.
  update: (ms: number, hold?: boolean, scroll?: DeskScroll) => void;
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
  scene.add(key.target);
  const keyBase = key.position.clone();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: 0x3a3226, opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { camera: cam } = layout;
  const camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 200);
  const look = new THREE.Vector3(cam.lookX, 0, cam.lookZ);

  type Item = { kind: Kind; obj: THREE_NS.Object3D; baseX: number; baseY: number; baseZ: number; baseRx: number; baseRy: number; baseRz: number; baseScale: number; delay: number; float: number; phase: number };
  const items: Item[] = [];
  let pencilTip: THREE_NS.Vector3 | null = null;
  layout.items.forEach((p, i) => {
    let obj: THREE_NS.Object3D;
    if (p.kind === "pencil") {
      const built = pencil(THREE);
      obj = new THREE.Group();
      obj.add(built.group);
      pencilTip = built.tip.clone();
    } else if (p.kind === "stack") {
      obj = stack(THREE, writablePaper(THREE).texture); // the landing's: stays a ruled sheet
    } else obj = BUILD[p.kind](THREE);
    obj.position.set(p.x, p.lift ?? 0, p.z);
    obj.rotation.y = p.rotY ?? 0;
    obj.scale.setScalar(p.scale ?? 1);
    if (p.kind === "plane") obj.rotation.z = 0.12;
    scene.add(obj);
    if (pencilTip && p.kind === "pencil") pencilTip.applyMatrix4(new THREE.Matrix4().compose(obj.position, obj.quaternion, obj.scale));
    items.push({ kind: p.kind, obj, baseX: obj.position.x, baseY: obj.position.y, baseZ: obj.position.z, baseRx: obj.rotation.x, baseRy: obj.rotation.y, baseRz: obj.rotation.z, baseScale: obj.scale.x, delay: i * 90, float: p.kind === "plane" ? 0.18 : 0, phase: i * 1.3 });
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
    d.userData.base = d.position.clone();
    scene.add(d);
    dashes.push(d);
  }

  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  // Set the first frame `hold` is false; the fall, the camera and the path
  // all run from it. Without an intro that's the first frame.
  let releasedAt: number | null = null;
  // Morph: everything but the paper stack is pushed out of frame, away from
  // the centre of the desk; the stack rises, turns to face the camera and
  // settles at layout.paperTo.
  const to = layout.paperTo;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
  const faceX = to ? Math.atan2(cam.z - to.z, cam.y - to.y) : 0;
  const pinNormal = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(faceX, 0, 0));
  const pinItem = items.find((it) => it.kind === "pin");

  // The tools book (desktop only): built once, placed where its section's
  // scroll puts it.
  const book = to ? buildBook(THREE, { clay, mesh, colors: CLAY }) : null;
  if (book) {
    book.group.visible = false;
    scene.add(book.group);
  }

  // The finale: the finished manuscript on the desk, the path's last pin
  // drops onto its corner, then a wide rubber stamp comes down, presses, and
  // lifts straight off to reveal READY printed on the page, before setting
  // down beside it. `tick(t)`, t 0 → 1; returns true on the press.
  const readyMark = () => {
    const tex = canvasTexture(THREE, 512, 240, (c) => {
      c.clearRect(0, 0, 512, 240);
      c.strokeStyle = hex(CLAY.teal);
      c.fillStyle = hex(CLAY.teal);
      c.lineWidth = 14;
      c.beginPath();
      c.roundRect(14, 14, 484, 212, 26);
      c.stroke();
      c.font = `700 124px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif"}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("READY", 256, 128);
      // rubber-stamp ink: specks where the print didn't take
      c.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 1400; i++) {
        c.globalAlpha = 0.25 + Math.random() * 0.6;
        c.fillRect(Math.random() * 512, Math.random() * 240, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, 0.14);
    return m;
  };
  // A stamp as wide as the mark: rubber face, teal block, handle and knob.
  const readyStamp = () => {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const rubber = mesh(THREE, new RoundedBoxGeometry(2.1, 0.06, 1.0, 2, 0.02), clay(THREE, CLAY.ink, 0.7));
    rubber.position.y = 0.03;
    const block = mesh(THREE, new RoundedBoxGeometry(2.2, 0.32, 1.1, 3, 0.08), clay(THREE, CLAY.teal));
    block.position.y = 0.22;
    const stem = mesh(THREE, new THREE.CylinderGeometry(0.17, 0.24, 0.72, 20), clay(THREE, CLAY.sand));
    stem.position.y = 0.74;
    const knob = mesh(THREE, new THREE.SphereGeometry(0.38, 24, 16), clay(THREE, CLAY.clay));
    knob.position.y = 1.22;
    body.add(rubber, block, stem, knob);
    g.add(body);
    return { g, body };
  };
  const buildFinale = (at: THREE_NS.Vector3) => {
    const paper = writablePaper(THREE);
    paper.draw(PAPER_TOTAL, false);
    const pile = stack(THREE, paper.texture);
    pile.position.copy(at);
    pile.rotation.y = 0.1;
    pile.scale.setScalar(1.1);
    const top = pile.children[pile.children.length - 1];
    const mark = readyMark();
    mark.position.set(0.4, 0.03, 0.95);
    top.add(mark);
    scene.add(pile);
    pile.updateMatrixWorld(true);
    const pinAt = top.localToWorld(new THREE.Vector3(-1.2, 0.02, -1.6)); // top-left corner
    const markAt = mark.getWorldPosition(new THREE.Vector3());
    const markYaw = new THREE.Euler().setFromQuaternion(mark.getWorldQuaternion(new THREE.Quaternion()), "YXZ").y;
    const lastPin = BUILD.pin(THREE);
    lastPin.scale.setScalar(0.8);
    const { g: stamper, body } = readyStamp();
    scene.add(lastPin, stamper);
    const rest = new THREE.Vector3(at.x - 0.9, 0, at.z + 3.1);
    const topY = pinAt.y;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    let pressed = false;
    const tick = (t: number) => {
      const drop = smooth(clamp01((t - 0.05) / 0.15));
      lastPin.visible = drop > 0;
      lastPin.position.copy(pinAt).y += (1 - drop) * 3;
      // down (0.26–0.4), pressed (0.4–0.5), straight up (0.5–0.62) — the
      // print shows as it lifts — then aside and down onto the desk
      const down = clamp01((t - 0.26) / 0.14);
      const press = clamp01((t - 0.4) / 0.1);
      const up = smooth(clamp01((t - 0.5) / 0.12));
      const aside = smooth(clamp01((t - 0.64) / 0.16));
      stamper.visible = t >= 0.26;
      const liftY = topY + 1.8;
      if (t < 0.64) stamper.position.set(markAt.x, t < 0.4 ? topY + 6 * (1 - down * down) : topY + 1.8 * up, markAt.z);
      else stamper.position.set(lerp(markAt.x, rest.x, aside), lerp(liftY, 0, aside) + Math.sin(Math.PI * aside) * 0.4, lerp(markAt.z, rest.z, aside));
      stamper.rotation.y = lerp(markYaw, -0.25, aside);
      body.scale.y = 1 - 0.12 * Math.sin(Math.PI * press);
      (mark.material as THREE_NS.MeshBasicMaterial).opacity = t >= 0.4 ? 0.92 : 0;
      const justPressed = t >= 0.4 && !pressed;
      pressed = t >= 0.4;
      return justPressed;
    };
    tick(0);
    return { objs: [pile, lastPin, stamper], pinAt, tick };
  };

  // The closing section's paper and pin, the book's pin, the finale, and the
  // trail — built once the page's layout is known (the first frame with a
  // scroll), rebuilt on resize. The trail stays flat on the desk, in legs:
  // the landing's pin → behind the paper's pin (leg 0), on from under the
  // paper → under the book's edge by its pin (leg 1), on from under the
  // book → under the finale's manuscript (leg 2).
  type Dash = { d: THREE_NS.Mesh; leg: 0 | 1 | 2 };
  let second: {
    paperZ: number;
    paper: WritablePaper;
    stackObj: THREE_NS.Object3D;
    newPin: THREE_NS.Object3D;
    pinAt: THREE_NS.Vector3;
    bookPin: THREE_NS.Object3D;
    bookPinAt: THREE_NS.Vector3;
    trail: Dash[];
    behindZ: number;
    props: Prop[];
    finale: ReturnType<typeof buildFinale>;
  } | null = null;
  const disposeSecond = () => {
    if (!second) return;
    scene.remove(second.stackObj, second.newPin, second.bookPin, ...second.trail.map((t) => t.d), ...second.props.map((p) => p.obj), ...second.finale.objs);
    second = null;
  };
  // Dashes along a curve on the desk.
  const layTrail = (pts: THREE_NS.Vector3[], leg: Dash["leg"]): Dash[] => {
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const along = new THREE.Vector3(1, 0, 0);
    const n = Math.floor(curve.getLength() / 0.42);
    const out: Dash[] = [];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const d = mesh(THREE, dashGeo, dashMat);
      d.position.copy(curve.getPointAt(t));
      d.quaternion.setFromUnitVectors(along, curve.getTangentAt(t));
      d.visible = false;
      scene.add(d);
      out.push({ d, leg });
    }
    return out;
  };
  // `beatsZ`: where the two beats start (the view's centre as they arrive).
  // `finaleZ`: the view's centre while the finale holds.
  const buildSecond = (paperZ: number, bookZ: number, beatsZ: number, finaleZ: number) => {
    if (!to || !pinItem || !book) return;
    disposeSecond();
    const paper = writablePaper(THREE);
    const stackObj = stack(THREE, paper.texture);
    stackObj.scale.setScalar(to.scale);
    scene.add(stackObj);
    const onPaper = new THREE.Matrix4().compose(
      new THREE.Vector3(to.x, to.y, to.z + paperZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(faceX, 0, 0)),
      new THREE.Vector3(to.scale, to.scale, to.scale),
    );
    const pinAt = new THREE.Vector3(-1.32, 0.14, -1.72).applyMatrix4(onPaper); // top-left corner
    const newPin = BUILD.pin(THREE);
    newPin.visible = false;
    scene.add(newPin);
    book.group.position.set(0, 0, bookZ);
    book.group.rotation.y = -0.03;
    book.group.updateMatrixWorld();
    book.group.visible = true;
    const bp = book.group.localToWorld(book.pinSpot.clone());
    const bookPin = BUILD.pin(THREE);
    bookPin.visible = false;
    scene.add(bookPin);
    const y = 0.06;
    const V = (x: number, py: number, z: number) => new THREE.Vector3(x, py, z);
    // The desk point hidden right behind the paper's pin, from the closing
    // view: the path runs in behind the paper there, so the pin holds it.
    const eye = new THREE.Vector3(cam.x, cam.y, cam.z + paperZ);
    const behind = eye.clone().lerp(pinAt, (eye.y - y) / (eye.y - pinAt.y));
    // Leg 0: from the landing's pin the path carries on the way it arrived —
    // rightwards — and slides off the right edge; it turns out of view, then
    // comes back from the upper right in one sweeping curve and runs in behind
    // the paper at its pin.
    const x0 = pinItem.baseX;
    const z0 = pinItem.baseZ;
    const toPaper = layTrail([
      V(x0, y, z0),
      V(x0 + 3, y, z0 + 0.7),
      V(x0 + 7.5, y, z0 + 2.2), // off the right edge
      V(13, y, (z0 + 2.2 + paperZ - 7) / 2),
      V(9.5, y, paperZ - 7), // back in, upper right
      V(5, y, paperZ - 5.8),
      V(2.4, y, paperZ - 4.4),
      V(behind.x + 0.15, y, behind.z - 0.9),
      behind.clone(),
    ], 0);
    // Leg 1: on behind the paper and out from under its bottom edge, then
    // down the middle of the view — between the two beats' copy, in view the
    // whole way — and under the book's top edge by its pin.
    const toBook = layTrail([
      behind.clone(),
      V(behind.x + 0.4, y, behind.z + 1.6),
      V(behind.x + 0.5, y, paperZ + 2.4),
      V(behind.x + 0.2, y, paperZ + 4.4), // out from under the paper
      V(1, y, paperZ + 6.2),
      V(0.3, y, paperZ + 8.5),
      V(0.2, y, (paperZ + bookZ) / 2),
      V(0.3, y, bookZ - 7),
      V(bp.x - 0.1, y, bp.z - 2.2),
      V(bp.x, y, bp.z - 0.8),
      V(bp.x, y, bp.z - 0.15), // under the book
    ], 1);
    // The finale's manuscript, right of its copy, lifted a touch so the path
    // runs in under it.
    const sheetAt = new THREE.Vector3(3.4, 0.13, finaleZ + 0.4);
    const finale = buildFinale(sheetAt);
    // Leg 2: on under the book and out from under its bottom edge, then down
    // to the manuscript and in under it at its pin.
    const fp = finale.pinAt;
    const toFinale = layTrail([
      V(bp.x, y, bp.z - 0.15),
      V(bp.x + 0.1, y, bookZ + 1),
      V(bp.x + 0.3, y, bookZ + 3.6), // out from under the book
      V((bp.x + fp.x) / 2 + 0.2, y, (bookZ + 3.6 + fp.z - 1.2) / 2),
      V(fp.x - 0.1, y, fp.z - 1.2),
      V(fp.x, y, fp.z), // under the manuscript, at its pin
    ], 2);
    // Desk objects along the two beats, where the path is out of view.
    const props = buildProps(THREE, beatsZ + 2.2, bookZ - 10.85);
    for (const pr of props) scene.add(pr.obj);
    second = { paperZ, paper, stackObj, newPin, pinAt, bookPin, bookPinAt: bp, trail: [...toPaper, ...toBook, ...toFinale], behindZ: behind.z - 1, props, finale };
  };

  // px per world unit along the desk (z) at the look point, for the base camera.
  const probeA = new THREE.Vector3();
  const probeB = new THREE.Vector3();
  const pxPerUnit = (vh: number) => {
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    probeA.copy(look).project(camera);
    probeB.copy(look).add(new THREE.Vector3(0, 0, 1)).project(camera);
    return Math.max(1e-3, ((probeA.y - probeB.y) * vh) / 2);
  };
  let lastSig = "";
  let typeStart: number | null = null;
  let typed = 0;
  let finaleStart: number | null = null;
  let finaleT = 0;
  let thumpAt = -Infinity; // the stamp's hit: the view dips with it
  const REST = { pan: 0, tilt: 0, bookZ: 0 };
  const [pin0, pin1] = BOOK_TIMING.pin;

  // `pan`: how far down the desk the view is; `tilt`: 0 → 1 as the camera
  // tips to look straight down on the book.
  const scrollScene = (ms: number, scroll?: DeskScroll) => {
    if (!to || !scroll) return REST;
    const ppu = pxPerUnit(scroll.vh);
    // The page scrolls on while a section is pinned; the desk holds.
    const [paperHold, bookHold, finaleHold] = [scroll.paper, scroll.book, scroll.finale].map((s) => ({ top: s.top, range: Math.max(0, s.height - scroll.vh) }));
    const held = (y: number) => [paperHold, bookHold, finaleHold].reduce((v, h) => v - Math.min(h.range, Math.max(0, y - h.top)), y);
    const through = (h: typeof paperHold) => (h.range > 0 ? clamp01((scroll.y - h.top) / h.range) : 0);
    const paperZ = held(paperHold.top) / ppu;
    const bookZ = look.z + held(bookHold.top) / ppu;
    const beatsZ = look.z + held(scroll.paper.top + scroll.paper.height - scroll.vh / 2) / ppu;
    const finaleZ = look.z + held(finaleHold.top) / ppu;
    const sig = [paperZ, bookZ, beatsZ, finaleZ].map((z) => Math.round(z * 100)).join("|");
    if (sig !== lastSig) {
      lastSig = sig;
      buildSecond(paperZ, bookZ, beatsZ, finaleZ);
    }
    if (!second || !book) return REST;
    const pan = held(scroll.y) / ppu;
    const hp = through(bookHold);
    book.setProgress(hp, reducedMotion);
    const T = BOOK_TIMING.tilt;
    const tilt = reducedMotion ? 0 : smooth(clamp01(hp / T)) * smooth(clamp01((1 - hp) / T));
    // key light and its shadow follow the view down the desk
    key.position.set(keyBase.x, keyBase.y, keyBase.z + pan);
    key.target.position.set(look.x, 0, look.z + pan);
    // The book's pin drops once its last spread is open.
    const dropBook = reducedMotion ? 1 : smooth(clamp01((hp - pin0) / (pin1 - pin0)));
    // The paper stands up as its section arrives; then the pin drops.
    const toGo = paperHold.top - scroll.y;
    const rise = reducedMotion ? 1 : smooth(clamp01((0.8 * scroll.vh - toGo) / (0.6 * scroll.vh)));
    const drop = reducedMotion ? 1 : smooth(clamp01((0.22 * scroll.vh - toGo) / (0.2 * scroll.vh)));
    const { stackObj, newPin, pinAt, bookPin, bookPinAt, trail, behindZ, paper, props } = second;
    // each prop: dropped in as the view reaches it, then its own small motion
    const viewZ = look.z + pan;
    for (const pr of props) {
      if (pr.shownAt === null && pr.z <= viewZ + (0.45 * scroll.vh) / ppu) pr.shownAt = ms;
      const inT = reducedMotion ? 1 : pr.shownAt === null ? 0 : clamp01((ms - pr.shownAt) / 750);
      pr.obj.visible = inT > 0;
      pr.tick(ms, inT, (viewZ - pr.z) / 8, reducedMotion);
    }
    stackObj.position.set(to.x, 0.02 + (to.y - 0.02) * rise, to.z + second.paperZ + 1.2 * (1 - rise));
    stackObj.rotation.set(faceX * rise, 0.18 * (1 - rise), 0);
    // The trail draws as the view reaches it. Its run in behind the paper
    // waits for the paper to stand (and its pin to drop); what's past the
    // paper waits until the page scrolls on from the closing view.
    const revealZ = viewZ + (0.32 * scroll.vh) / ppu;
    const pastPaper = scroll.y > paperHold.top + paperHold.range;
    for (const { d, leg } of trail) {
      const z = d.position.z;
      d.visible = z <= revealZ && (leg === 0 ? z < behindZ || drop > 0 : leg === 1 ? pastPaper : dropBook >= 1);
    }
    // The finale plays once its view arrives, at its own pace — or as fast as
    // the scroll through its hold — and stays played. Reduced motion: it's
    // simply there, stamped.
    if (finaleStart === null && scroll.y >= finaleHold.top - 0.05 * scroll.vh) finaleStart = ms;
    if (finaleStart !== null) finaleT = reducedMotion ? 1 : Math.max(finaleT, Math.min(1, Math.max((ms - finaleStart) / 3600, through(finaleHold) / 0.7)));
    if (second.finale.tick(finaleT) && !reducedMotion) thumpAt = ms;
    bookPin.visible = dropBook > 0;
    bookPin.position.copy(bookPinAt).y += (1 - dropBook) * 3;
    bookPin.scale.setScalar(0.8);
    newPin.visible = drop > 0;
    newPin.position.copy(pinAt).addScaledVector(pinNormal, (1 - drop) * 3);
    newPin.rotation.set(0.45 * faceX, 0, 0);
    newPin.scale.setScalar(0.8);
    // It writes itself once it has stood up, at its own pace — but finished
    // by the time the closing section's hold ends, however fast the scroll —
    // and stays written.
    if (rise >= 0.97 && typeStart === null) typeStart = ms;
    if (typeStart !== null) {
      const byTime = ((ms - typeStart) / 1000) * TYPE_CHARS_PER_SECOND;
      const byScroll = (through(paperHold) / 0.85) * PAPER_TOTAL;
      typed = reducedMotion ? PAPER_TOTAL : Math.max(typed, Math.min(PAPER_TOTAL, Math.floor(Math.max(byTime, byScroll))));
    }
    paper.draw(typed, typeStart !== null && Math.floor(ms / 500) % 2 === 0);
    return { pan, tilt, bookZ };
  };

  // Looking straight down on the book (blended in by `tilt`), the book a
  // little above centre so the caption under it has room.
  const overBook = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const aimOver = new THREE.Vector3();
  const update = (ms: number, hold = false, scroll?: DeskScroll) => {
    if (reducedMotion) {
      for (const it of items) it.obj.position.y = it.baseY;
      const { pan } = scrollScene(ms, scroll);
      camera.position.set(cam.x, cam.y, cam.z + pan);
      camera.lookAt(look.x, look.y, look.z + pan);
      return;
    }
    if (!hold && releasedAt === null) releasedAt = ms;
    const since = releasedAt === null ? -Infinity : ms - releasedAt;
    for (const it of items) {
      const settle = ease((since - 120 - it.delay) / 1000);
      const up = 1 - settle;
      const float = Math.sin(ms * 0.0012 + it.phase) * it.float;
      it.obj.position.y = it.baseY + up * (1.6 + Math.sin(ms * 0.0013 + it.phase) * 0.3) + float;
      it.obj.rotation.x = it.baseRx + up * 0.5 * Math.sin(ms * 0.0009 + it.phase);
      it.obj.rotation.z = it.baseRz + up * 0.4 * Math.cos(ms * 0.0008 + it.phase * 0.7);
    }
    const shown = Math.floor(ease((since - 800) / 1600) * dashes.length);
    dashes.forEach((d, i) => (d.visible = i < shown));
    const { pan, tilt, bookZ } = scrollScene(ms, scroll);
    // Closer in while holding, then back out to the landing framing.
    const pull = 1 - ease(since / 1400);
    camera.position.set(cam.x, cam.y * (1 - pull * 0.1), cam.z * (1 - pull * 0.1) + pan);
    aim.set(look.x, look.y, look.z + pan);
    if (tilt > 0) {
      camera.position.lerp(overBook.set(0, 15, bookZ + 3.4), tilt);
      aim.lerp(aimOver.set(0, 0, bookZ + 0.5), tilt);
    }
    const thump = (ms - thumpAt) / 240;
    if (thump < 1) camera.position.y -= 0.14 * Math.sin(Math.PI * thump) * (1 - thump);
    camera.lookAt(aim);
  };

  return { scene, camera, update };
}

// The homepage landing: the desk frames the centred wordmark from the edges,
// and the path loops from the pencil tip around the words to the pin.
export const LANDING_DESK: DeskLayout = {
  camera: { x: 0, y: 12, z: 10, lookX: 0, lookZ: 0.4, fov: 32 },
  items: [
    { kind: "pencil", x: -7.2, z: -2.8, rotY: -0.35 },
    { kind: "graph", x: 6.4, z: -2.9, rotY: -0.3 },
    { kind: "chart", x: 6.4, z: -3.1, rotY: -0.3, lift: 0.036 },
    { kind: "ruler", x: -5.6, z: 3.6, rotY: -0.14 },
    { kind: "stack", x: 6.6, z: 2.8, rotY: 0.18 },
    { kind: "notebook", x: -9.6, z: 0.4, rotY: 0.5 },
    { kind: "plane", x: 2.6, z: -2.4, rotY: 0.3, lift: 1.6, scale: 0.6 },
    { kind: "pin", x: 3.8, z: 4.1 },
  ],
  path: [[-4.95, -1.9], [-5.3, 0.3], [-4.6, 2.7], [-1.6, 3.7], [2.0, 3.8], [3.6, 4.1]],
  paperTo: { x: 2.95, y: 1.2, z: 1.7, scale: 1.15 },
};

// Phones: the text is full width, so the desk sits above and below it.
export const LANDING_DESK_NARROW: DeskLayout = {
  camera: { x: 0, y: 17, z: 7, lookX: 0, lookZ: 0.2, fov: 40 },
  items: [
    { kind: "pencil", x: -1.4, z: -5.6, rotY: -0.35, scale: 0.8 },
    { kind: "graph", x: 2.4, z: -5.3, rotY: -0.3, scale: 0.7 },
    { kind: "chart", x: 2.4, z: -5.5, rotY: -0.3, lift: 0.03, scale: 0.7 },
    { kind: "plane", x: -2.4, z: -3.6, rotY: 0.4, lift: 1.4, scale: 0.45 },
    { kind: "ruler", x: -1.2, z: 5.7, rotY: -0.18, scale: 0.75 },
    { kind: "stack", x: 2.9, z: 6.3, rotY: 0.2, scale: 0.7 },
    { kind: "pin", x: 1.3, z: 4.6, scale: 0.85 },
  ],
  path: [[0.2, -5.0], [-2.6, -3.0], [-3.0, 0.6], [-2.2, 3.4], [0.3, 4.3], [1.1, 4.6]],
};
