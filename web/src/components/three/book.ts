import type * as THREE_NS from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SPREADS, BOOK_TIMING } from "./bookSpreads.ts";
import { drawPage, type Fonts, type PageSpec } from "./bookPages.ts";

// The homepage's open book: a clay hardcover lying open on the desk, one tool
// per spread (bookSpreads.ts), turned right to left by scroll. Two turning
// leaves carry the pages that change; each bends as it turns — the free
// corner lifts first and lands last — by laying its vertices out along a
// curve every frame (arc length kept, so the page doesn't stretch).

type T = typeof THREE_NS;
export type Kit = {
  clay: (THREE: T, color: number, roughness?: number) => THREE_NS.Material;
  mesh: (THREE: T, geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material) => THREE_NS.Mesh;
  colors: { teal: number; clay: number; sheet: number };
};
export type Book = {
  group: THREE_NS.Group;
  // Where the checkpoint pin goes (book-local): the left page's top, by the gutter.
  pinSpot: THREE_NS.Vector3;
  // `hp`: 0 → 1 through the book's pinned scroll. `still`: turns snap.
  setProgress: (hp: number, still: boolean) => void;
};

const PW = 4.2; // page width (spine → edge)
const PD = 5.6; // page depth
const FD = PD - 0.03; // printed faces sit just inside the block's edge
const BOARD = 0.12;
const BLOCK = 0.2;
const TOP = BOARD + BLOCK;
const NX = 40;
const NZ = 10;
const CW = 1024;
const CH = 1365;

function fonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  return { serif: v("--font-serif", "Georgia, serif"), sans: v("--font-sans", "system-ui, sans-serif"), mono: v("--font-mono", "monospace") };
}

// Leaf shape at turn `t`: the angle along the page grows from the spine
// (base) toward the edge (bend), the near corner bending most.
function layLeaf(pos: Float32Array, col: Float32Array, t: number) {
  const e = t * t * (3 - 2 * t);
  const base = Math.PI * e;
  const lead = Math.sin(Math.PI * t) * (0.6 - t) * 2.6; // edge leads early, trails late
  const ds = PW / NX;
  for (let iz = 0; iz <= NZ; iz++) {
    const zf = iz / NZ;
    const bend = lead * (0.6 + 0.8 * zf);
    let x = 0;
    let y = 0;
    for (let ix = 0; ix <= NX; ix++) {
      const s = ix / NX;
      const phi = Math.min(Math.PI, Math.max(0, base + bend * s * s));
      const k = (iz * (NX + 1) + ix) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = -FD / 2 + zf * FD;
      // shade the side that faces up by how it faces the key light (upper left)
      const up = Math.cos(phi) >= 0 ? 1 : -1;
      const lit = up * (0.45 * Math.sin(phi) + 0.89 * Math.cos(phi));
      const shade = Math.min(1, Math.max(0.62, 0.78 + 0.22 * (lit / 0.89)));
      col[k] = col[k + 1] = col[k + 2] = shade;
      const mid = Math.min(Math.PI, Math.max(0, base + bend * (s + 0.5 / NX) ** 2));
      x += Math.cos(mid) * ds;
      y += Math.sin(mid) * ds;
    }
  }
}

export function buildBook(THREE: T, kit: Kit): Book {
  const { clay, mesh, colors } = kit;
  const group = new THREE.Group();

  const board = mesh(THREE, new RoundedBoxGeometry(2 * PW + 0.6, BOARD, PD + 0.56, 3, 0.05), clay(THREE, colors.teal));
  board.position.y = BOARD / 2;
  group.add(board);
  for (const side of [-1, 1]) {
    const block = mesh(THREE, new RoundedBoxGeometry(PW - 0.02, BLOCK, PD, 2, 0.012), clay(THREE, colors.sheet, 0.95));
    block.position.set(side * (PW / 2 + 0.01), BOARD + BLOCK / 2, 0);
    group.add(block);
  }
  // a ribbon marker out of the foot of the spine, onto the desk
  const ribbon = mesh(THREE, new RoundedBoxGeometry(0.16, 0.02, 1.3, 2, 0.008), clay(THREE, colors.clay));
  ribbon.position.set(0.25, 0.012, PD / 2 + 0.65);
  ribbon.rotation.y = -0.25;
  group.add(ribbon);

  // Six page faces: static left (spread 0's heading) and right (spread 2's
  // art); leaf k shows spread k's art on its front and spread k+1's heading
  // on its back.
  const specs: PageSpec[] = [];
  SPREADS.forEach((spread, i) => {
    specs.push({ kind: "heading", spread, spine: "right", page: 2 * i + 12 });
    specs.push({ kind: "art", spread, spine: "left", page: 2 * i + 13 });
  });
  const canvases = specs.map(() => {
    const c = document.createElement("canvas");
    c.width = CW;
    c.height = CH;
    return c;
  });
  const textures = canvases.map((c) => {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  });
  const drawAll = () => {
    const f = fonts();
    specs.forEach((spec, i) => {
      drawPage(canvases[i].getContext("2d")!, CW, CH, spec, f);
      textures[i].needsUpdate = true;
    });
  };
  drawAll();
  void document.fonts?.ready.then(drawAll);
  // a leaf's back is seen mirrored once it has turned over
  const mirrored = (tex: THREE_NS.CanvasTexture) => {
    const m = tex.clone();
    m.wrapS = THREE.RepeatWrapping;
    m.repeat.x = -1;
    m.offset.x = 1;
    m.needsUpdate = true;
    return m;
  };
  const texOf = (spread: number, kind: "heading" | "art") => textures[spread * 2 + (kind === "art" ? 1 : 0)];

  // Static pages, plus a shadow-catcher over each so a lifting leaf shades them.
  const face = (tex: THREE_NS.Texture, x: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, FD), new THREE.MeshBasicMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, TOP + 0.001, 0);
    group.add(m);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(PW, FD), new THREE.ShadowMaterial({ color: 0x3a3226, opacity: 0.2 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(x, TOP + 0.003, 0);
    catcher.receiveShadow = true;
    group.add(catcher);
  };
  face(texOf(0, "heading"), -PW / 2);
  face(texOf(SPREADS.length - 1, "art"), PW / 2);

  // clone()d textures share the canvas but track needsUpdate on their own
  const backs: THREE_NS.Texture[] = [];
  const leaves = BOOK_TIMING.turns.map(([a, b], k) => {
    const geo = new THREE.PlaneGeometry(PW, FD, NX, NZ);
    const pos = geo.attributes.position.array as Float32Array;
    const col = new Float32Array(pos.length);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const back = mirrored(texOf(k + 1, "heading"));
    backs.push(back);
    const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texOf(k, "art"), vertexColors: true, side: THREE.FrontSide, shadowSide: THREE.DoubleSide }));
    const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: back, vertexColors: true, side: THREE.BackSide }));
    front.castShadow = true;
    const g = new THREE.Group();
    g.add(front, rear);
    for (const m of [front, rear]) m.frustumCulled = false;
    group.add(g);
    return { a, b, k, g, geo, pos, col, t: -1 };
  });
  void document.fonts?.ready.then(() => backs.forEach((t) => (t.needsUpdate = true)));

  const n = leaves.length;
  const setProgress = (hp: number, still: boolean) => {
    for (const lf of leaves) {
      let t = Math.min(1, Math.max(0, (hp - lf.a) / (lf.b - lf.a)));
      if (still) t = t >= 0.5 ? 1 : 0;
      if (t === lf.t) continue;
      lf.t = t;
      layLeaf(lf.pos, lf.col, t);
      lf.geo.attributes.position.needsUpdate = true;
      lf.geo.attributes.color.needsUpdate = true;
      // stacking: unturned leaves lie in order on the right, turned ones on the left
      const onRight = (n - lf.k) * 0.004;
      const onLeft = (lf.k + 1) * 0.004;
      lf.g.position.y = TOP + 0.004 + onRight + (onLeft - onRight) * t;
    }
  };
  setProgress(0, true);

  return { group, pinSpot: new THREE.Vector3(-1, TOP, -PD / 2 + 0.62), setProgress };
}
