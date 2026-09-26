import type { Spread } from "./bookSpreads.ts";

// Draws one page of the homepage book onto a canvas (the texture the 3D page
// shows). Left pages carry the tool — number, name, heading with the teal
// cutout, one line; right pages carry a simple illustration. `spine` is the
// side of the canvas at the book's spine (gutter shading, wider margin).

export type Fonts = { serif: string; sans: string; mono: string };
export type PageSpec = { kind: "heading" | "art"; spread: Spread; spine: "left" | "right"; page: number };

const INK = "#2a2f38";
const SOFT = "#565b66";
const TEAL = "#2c5f6f";
const TEAL_SOFT = "#6f98a2";
const TEAL_PALE = "#b9d0d2";
const CLAY = "#c27a5c";
const CLAY_SOFT = "#e3ad94";
const WOOD = "#e4c49a";
const PAPER = "#fbf8f1";
const LINE = "#dcd8cf";

type C = CanvasRenderingContext2D;

function wrap(c: C, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (line && c.measureText(next).width > width) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function rr(c: C, x: number, y: number, w: number, h: number, r: number | number[]) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

// A soft, warm drop shadow under whatever is filled inside `draw`.
function shadowed(c: C, draw: () => void, blur = 34, dy = 14) {
  c.save();
  c.shadowColor = "rgba(58,44,28,.2)";
  c.shadowBlur = blur;
  c.shadowOffsetY = dy;
  draw();
  c.restore();
}

function heading(c: C, W: number, H: number, s: Spread, spine: PageSpec["spine"], f: Fonts) {
  const L = spine === "left" ? 150 : 100;
  const R = spine === "left" ? 100 : 150;
  const textW = W - L - R;
  // number chip + tool name
  c.strokeStyle = TEAL;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(L + 30, 170, 30, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = TEAL;
  c.font = `500 26px ${f.mono}`;
  c.textAlign = "center";
  c.fillText(s.n, L + 30, 179);
  c.textAlign = "left";
  c.font = `500 38px ${f.sans}`;
  c.fillText(s.tool, L + 78, 183);
  // heading: the lead in the serif, then the key word in the teal cutout
  c.fillStyle = INK;
  c.font = `500 112px ${f.serif}`;
  c.letterSpacing = "-4px";
  let y = 520;
  for (const line of wrap(c, s.lead, textW)) {
    c.fillText(line, L, y);
    y += 118;
  }
  c.font = `600 108px ${f.sans}`;
  c.letterSpacing = "-5px";
  const pad = 20;
  const cw = c.measureText(s.cut).width + pad * 2;
  c.fillStyle = "rgba(44,95,111,.22)";
  c.fillRect(L + 12, y - 92 + 11, cw, 128);
  c.fillStyle = TEAL;
  c.fillRect(L, y - 92, cw, 128);
  c.fillStyle = PAPER;
  c.fillText(s.cut, L + pad, y + 8);
  c.letterSpacing = "0px";
  // one line
  y += 150;
  c.fillStyle = SOFT;
  c.font = `400 46px ${f.sans}`;
  for (const line of wrap(c, s.line, textW)) {
    c.fillText(line, L, y);
    y += 64;
  }
  c.fillStyle = TEAL;
  c.fillRect(L, H - 210, 76, 6);
}

function artReview(c: C, W: number, H: number, off: number) {
  const w = 560;
  const h = 720;
  const x0 = (W - w) / 2 + off;
  const y0 = 300;
  c.save();
  c.translate(x0 + w / 2, y0 + h / 2);
  c.rotate(-0.045);
  c.translate(-w / 2, -h / 2);
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, 0, 0, w, h, 10);
    c.fill();
  });
  c.fillStyle = INK;
  rr(c, 60, 80, 300, 24, 6);
  c.fill();
  const lens = [440, 400, 430, 250, 420, 440, 380, 430, 300, 410, 360, 200];
  lens.forEach((len, i) => {
    c.fillStyle = LINE;
    rr(c, 60, 160 + i * 44, len, 14, 7);
    c.fill();
  });
  // margin marks: a ring round a phrase, a tick in the margin, a squiggle
  c.lineCap = "round";
  c.strokeStyle = CLAY;
  c.lineWidth = 7;
  c.beginPath();
  c.ellipse(250, 160 + 2 * 44 + 7, 130, 30, -0.03, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = TEAL;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(w - 70, 160 + 5 * 44);
  c.lineTo(w - 52, 160 + 5 * 44 + 20);
  c.lineTo(w - 22, 160 + 5 * 44 - 18);
  c.stroke();
  c.strokeStyle = CLAY;
  c.lineWidth = 6;
  c.beginPath();
  for (let x = 0; x <= 280; x += 4) {
    const y = 160 + 7 * 44 + 30 + Math.sin(x / 14) * 6;
    if (x === 0) c.moveTo(60 + x, y);
    else c.lineTo(60 + x, y);
  }
  c.stroke();
  c.restore();
  // a sticky note on the corner
  c.save();
  c.translate(x0 + w - 70, y0 + h - 150);
  c.rotate(0.1);
  shadowed(c, () => {
    c.fillStyle = CLAY_SOFT;
    rr(c, 0, 0, 220, 220, 8);
    c.fill();
  }, 24, 10);
  c.fillStyle = "rgba(255,255,255,.75)";
  [60, 100, 140].forEach((y, i) => {
    rr(c, 32, y, i === 2 ? 100 : 150, 12, 6);
    c.fill();
  });
  c.restore();
}

function artWrite(c: C, W: number, H: number, off: number) {
  const w = 560;
  const h = 740;
  const x0 = (W - w) / 2 + off;
  const y0 = 290;
  c.save();
  c.translate(x0 + w / 2, y0 + h / 2);
  c.rotate(0.03);
  c.translate(-w / 2, -h / 2);
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, 0, 0, w, h, 10);
    c.fill();
  });
  c.fillStyle = TEAL;
  rr(c, 60, 70, 380, 30, 6);
  c.fill();
  c.fillStyle = LINE;
  rr(c, 60, 124, 240, 16, 8);
  c.fill();
  c.fillStyle = TEAL;
  c.fillRect(60, 170, w - 120, 4);
  // two columns of text, a figure in the right one
  const col = (w - 120 - 30) / 2;
  for (let i = 0; i < 11; i++) {
    c.fillStyle = LINE;
    rr(c, 60, 210 + i * 40, i % 4 === 3 ? col * 0.6 : col, 12, 6);
    c.fill();
  }
  c.fillStyle = TEAL_PALE;
  rr(c, 60 + col + 30, 210, col, 190, 8);
  c.fill();
  [0.45, 0.75, 0.6, 0.9].forEach((v, i) => {
    c.fillStyle = i === 3 ? CLAY : TEAL;
    const bh = 140 * v;
    rr(c, 60 + col + 30 + 26 + i * 40, 210 + 170 - bh, 26, bh, 5);
    c.fill();
  });
  for (let i = 0; i < 6; i++) {
    c.fillStyle = LINE;
    rr(c, 60 + col + 30, 430 + i * 40, i === 5 ? col * 0.5 : col, 12, 6);
    c.fill();
  }
  c.restore();
  // a pencil resting across the page
  c.save();
  c.translate(x0 + w - 60, y0 + h - 40);
  c.rotate(-2.4);
  shadowed(c, () => {
    c.fillStyle = TEAL;
    rr(c, 0, -18, 330, 36, 6);
    c.fill();
  }, 20, 12);
  c.fillStyle = CLAY_SOFT;
  rr(c, -46, -18, 40, 36, 10);
  c.fill();
  c.fillStyle = "#c9c6bd";
  c.fillRect(-10, -19, 14, 38);
  c.fillStyle = WOOD;
  c.beginPath();
  c.moveTo(330, -18);
  c.lineTo(400, 0);
  c.lineTo(330, 18);
  c.fill();
  c.fillStyle = INK;
  c.beginPath();
  c.moveTo(382, -5);
  c.lineTo(400, 0);
  c.lineTo(382, 5);
  c.fill();
  c.restore();
}

function artFigures(c: C, W: number, H: number, off: number) {
  const w = 620;
  const h = 600;
  const x0 = (W - w) / 2 + off;
  const y0 = 360;
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, x0, y0, w, h, 12);
    c.fill();
  });
  const base = y0 + h - 90;
  const left = x0 + 70;
  const right = x0 + w - 50;
  c.strokeStyle = LINE;
  c.lineWidth = 2;
  c.setLineDash([8, 10]);
  for (let i = 1; i <= 4; i++) {
    c.beginPath();
    c.moveTo(left, base - i * 95);
    c.lineTo(right, base - i * 95);
    c.stroke();
  }
  c.setLineDash([]);
  const vals = [0.45, 0.72, 0.56, 0.93, 0.64];
  const cols = [TEAL_PALE, TEAL_SOFT, TEAL, CLAY, CLAY_SOFT];
  const bw = 62;
  const gap = (right - left - bw * vals.length) / (vals.length - 1);
  const tops: [number, number][] = [];
  vals.forEach((v, i) => {
    const x = left + i * (bw + gap);
    const bh = v * 380;
    tops.push([x + bw / 2, base - bh - 40]);
    shadowed(c, () => {
      c.fillStyle = cols[i];
      rr(c, x, base - bh, bw, bh, [14, 14, 4, 4]);
      c.fill();
    }, 18, 8);
  });
  c.fillStyle = INK;
  c.fillRect(left - 20, base, right - left + 40, 4);
  // a trend line over the bars
  c.strokeStyle = INK;
  c.lineWidth = 5;
  c.lineJoin = "round";
  c.beginPath();
  tops.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  tops.forEach(([x, y]) => {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(x, y, 12, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 5;
    c.stroke();
  });
}

export function drawPage(c: C, W: number, H: number, spec: PageSpec, f: Fonts) {
  c.clearRect(0, 0, W, H);
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  // gutter shading at the spine
  const atLeft = spec.spine === "left";
  const g = c.createLinearGradient(atLeft ? 0 : W, 0, atLeft ? W * 0.16 : W * 0.84, 0);
  g.addColorStop(0, "rgba(90,70,45,.18)");
  g.addColorStop(1, "rgba(90,70,45,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const off = atLeft ? 30 : -30;
  if (spec.kind === "heading") heading(c, W, H, spec.spread, spec.spine, f);
  else if (spec.spread.art === "review") artReview(c, W, H, off);
  else if (spec.spread.art === "write") artWrite(c, W, H, off);
  else artFigures(c, W, H, off);
  // page number, outer corner
  c.fillStyle = SOFT;
  c.font = `400 26px ${f.mono}`;
  c.textAlign = atLeft ? "right" : "left";
  c.fillText(String(spec.page), atLeft ? W - 90 : 90, H - 90);
  c.textAlign = "left";
}
