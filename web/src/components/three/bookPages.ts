import type { Spread } from "./bookSpreads.ts";

// Draws one page of the homepage book onto a canvas (the texture the 3D page
// shows). Left pages carry the tool — number, name, heading with the teal
// cutout, one line, three plain benefits, the chapter's numeral; right pages
// carry a picture of it with a figure caption. `spine` is the side of the
// canvas at the book's spine (gutter shading, wider margin).

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

// Grey placeholder text lines.
function lines(c: C, x: number, y: number, step: number, lens: number[], h = 12, color = LINE) {
  c.fillStyle = color;
  lens.forEach((len, i) => {
    rr(c, x, y + i * step, len, h, h / 2);
    c.fill();
  });
}

function heading(c: C, W: number, H: number, s: Spread, spine: PageSpec["spine"], f: Fonts) {
  const L = spine === "left" ? 150 : 100;
  const R = spine === "left" ? 100 : 150;
  const textW = W - L - R;
  // the chapter's numeral, faint, in the lower corner
  c.fillStyle = "rgba(44,95,111,.07)";
  c.font = `500 400px ${f.serif}`;
  c.textAlign = "right";
  c.fillText(s.n, W - R + 20, H - 50);
  c.textAlign = "left";
  // number chip + tool name
  c.strokeStyle = TEAL;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(L + 30, 200, 30, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = TEAL;
  c.font = `500 26px ${f.mono}`;
  c.textAlign = "center";
  c.fillText(s.n, L + 30, 209);
  c.textAlign = "left";
  c.font = `500 38px ${f.sans}`;
  c.fillText(s.tool, L + 78, 213);
  // heading: the lead in the serif, then the key word in the teal cutout
  c.fillStyle = INK;
  c.font = `500 112px ${f.serif}`;
  c.letterSpacing = "-4px";
  let y = 410;
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
  y += 140;
  c.fillStyle = SOFT;
  c.font = `400 44px ${f.sans}`;
  for (const line of wrap(c, s.line, textW)) {
    c.fillText(line, L, y);
    y += 60;
  }
  // three plain benefits, each ticked
  y += 44;
  c.fillStyle = TEAL;
  c.fillRect(L, y - 30, 64, 5);
  y += 50;
  c.font = `400 36px ${f.sans}`;
  for (const point of s.points) {
    c.fillStyle = TEAL;
    rr(c, L, y - 30, 34, 34, 8);
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(L + 8, y - 13);
    c.lineTo(L + 15, y - 6);
    c.lineTo(L + 27, y - 21);
    c.stroke();
    c.fillStyle = INK;
    c.fillText(point, L + 54, y);
    y += 60;
  }
}

// A manuscript with a reviewer's notes in its wide right margin.
function artReview(c: C, W: number, off: number, f: Fonts) {
  const w = 600;
  const h = 760;
  c.save();
  c.translate((W - w) / 2 + off + w / 2, 180 + h / 2);
  c.rotate(-0.03);
  c.translate(-w / 2, -h / 2);
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, 0, 0, w, h, 10);
    c.fill();
  });
  c.fillStyle = INK;
  rr(c, 50, 60, 270, 22, 6);
  c.fill();
  lines(c, 50, 100, 26, [190, 150], 10);
  lines(c, 50, 170, 38, [280, 260, 275, 180, 270, 280, 240, 275, 200, 265, 250, 280, 150, 230]);
  // the margin rule and notes
  c.strokeStyle = "rgba(194,122,92,.35)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(350, 150);
  c.lineTo(350, h - 60);
  c.stroke();
  c.lineCap = "round";
  const note = (text: string, color: string, fromX: number, y: number) => {
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(fromX, y);
    c.lineTo(362, y);
    c.stroke();
    c.fillStyle = color;
    c.font = `italic 400 28px ${f.serif}`;
    c.fillText(text, 372, y + 9);
  };
  // a phrase circled
  c.strokeStyle = CLAY;
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(190, 170 + 2 * 38 + 6, 92, 24, -0.03, 0, Math.PI * 2);
  c.stroke();
  note("unclear?", CLAY, 284, 252);
  // a result ticked
  c.strokeStyle = TEAL;
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(296, 170 + 6 * 38 + 2);
  c.lineTo(310, 170 + 6 * 38 + 16);
  c.lineTo(334, 170 + 6 * 38 - 12);
  c.stroke();
  note("numbers add up", TEAL, 340, 404);
  // a claim underlined
  c.strokeStyle = CLAY;
  c.lineWidth = 5;
  c.beginPath();
  for (let x = 0; x <= 220; x += 4) {
    const yy = 170 + 9 * 38 + 22 + Math.sin(x / 13) * 5;
    if (x === 0) c.moveTo(50 + x, yy);
    else c.lineTo(50 + x, yy);
  }
  c.stroke();
  note("cite this", CLAY, 276, 536);
  note("tighten", CLAY, 290, 596);
  c.restore();
  // a sticky note on the corner
  c.save();
  c.translate((W - w) / 2 + off + w - 190, 180 + h - 100);
  c.rotate(0.09);
  shadowed(c, () => {
    c.fillStyle = CLAY_SOFT;
    rr(c, 0, 0, 250, 190, 8);
    c.fill();
  }, 24, 10);
  c.fillStyle = INK;
  c.font = `italic 400 28px ${f.serif}`;
  c.fillText("Strong", 26, 62);
  c.fillText("results —", 26, 100);
  c.fillText("sharpen intro", 26, 138);
  c.restore();
}

// A page set in the journal's template: masthead, title, abstract box, two
// columns with a figure.
function artWrite(c: C, W: number, off: number, f: Fonts) {
  const w = 600;
  const h = 800;
  c.save();
  c.translate((W - w) / 2 + off + w / 2, 170 + h / 2);
  c.rotate(0.02);
  c.translate(-w / 2, -h / 2);
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, 0, 0, w, h, 10);
    c.fill();
  });
  // masthead
  c.fillStyle = TEAL;
  rr(c, 44, 40, 34, 34, 6);
  c.fill();
  c.fillStyle = INK;
  c.font = `500 26px ${f.serif}`;
  c.fillText("Headwater Letters", 92, 66);
  c.fillStyle = SOFT;
  c.font = `400 18px ${f.mono}`;
  c.textAlign = "right";
  c.fillText("Vol. 12", w - 44, 64);
  c.textAlign = "left";
  c.fillStyle = TEAL;
  c.fillRect(44, 92, w - 88, 4);
  // title and authors
  c.fillStyle = INK;
  c.font = `500 36px ${f.serif}`;
  c.fillText("Seasonal nitrate flux in", 44, 148);
  c.fillText("headwater streams", 44, 190);
  c.fillStyle = SOFT;
  c.font = `400 19px ${f.sans}`;
  c.fillText("A. Rao, M. Lindqvist, T. Okafor", 44, 226);
  // abstract box
  c.fillStyle = "rgba(185,208,210,.35)";
  rr(c, 44, 250, w - 88, 110, 8);
  c.fill();
  c.fillStyle = TEAL;
  c.font = `600 18px ${f.sans}`;
  c.fillText("Abstract", 62, 280);
  lines(c, 62, 296, 20, [460, 440, 470, 300], 9, "rgba(42,47,56,.2)");
  // two columns; a figure with its caption in the right one
  const col = (w - 88 - 28) / 2;
  lines(c, 44, 388, 30, [col, col, col * 0.7, col, col, col, col * 0.55, col, col, col, col * 0.8, col, col], 11);
  const fx = 44 + col + 28;
  c.fillStyle = TEAL_PALE;
  rr(c, fx, 388, col, 200, 8);
  c.fill();
  [0.45, 0.75, 0.6, 0.9].forEach((v, i) => {
    c.fillStyle = i === 3 ? CLAY : TEAL;
    const bh = 140 * v;
    rr(c, fx + 30 + i * 52, 388 + 176 - bh, 30, bh, 5);
    c.fill();
  });
  c.fillStyle = SOFT;
  c.font = `italic 400 17px ${f.serif}`;
  c.fillText("Fig. 1  Load by stream.", fx, 614);
  lines(c, fx, 640, 30, [col, col, col * 0.6], 11);
  c.fillStyle = SOFT;
  c.font = `400 16px ${f.mono}`;
  c.textAlign = "center";
  c.fillText("12", w / 2, h - 28);
  c.textAlign = "left";
  c.restore();
  // a pencil resting along the foot of the page
  c.save();
  c.translate((W - w) / 2 + off + w + 20, 170 + h - 26);
  c.rotate(-2.98);
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

// A finished chart: title, gridlines with ticks, bars, trend line, legend.
function artFigures(c: C, W: number, off: number, f: Fonts) {
  const w = 660;
  const h = 700;
  const x0 = (W - w) / 2 + off;
  const y0 = 250;
  shadowed(c, () => {
    c.fillStyle = "#ffffff";
    rr(c, x0, y0, w, h, 12);
    c.fill();
  });
  c.fillStyle = INK;
  c.font = `500 32px ${f.serif}`;
  c.fillText("Nitrate load by stream", x0 + 50, y0 + 70);
  c.fillStyle = SOFT;
  c.font = `400 20px ${f.sans}`;
  c.fillText("2019–2024, kg N per ha", x0 + 50, y0 + 102);
  // legend
  c.fillStyle = TEAL;
  rr(c, x0 + w - 210, y0 + 56, 22, 22, 5);
  c.fill();
  c.fillStyle = SOFT;
  c.font = `400 19px ${f.sans}`;
  c.fillText("Observed", x0 + w - 178, y0 + 74);
  c.strokeStyle = INK;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x0 + w - 210, y0 + 104);
  c.lineTo(x0 + w - 188, y0 + 104);
  c.stroke();
  c.fillText("Trend", x0 + w - 178, y0 + 111);
  // plot
  const left = x0 + 110;
  const right = x0 + w - 50;
  const top = y0 + 160;
  const base = y0 + h - 100;
  c.font = `400 18px ${f.mono}`;
  c.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const yy = base - (i * (base - top)) / 4;
    c.strokeStyle = LINE;
    c.lineWidth = 2;
    c.setLineDash(i ? [8, 10] : []);
    c.beginPath();
    c.moveTo(left, yy);
    c.lineTo(right, yy);
    c.stroke();
    c.fillStyle = SOFT;
    c.fillText(String(i * 25), left - 16, yy + 6);
  }
  c.setLineDash([]);
  c.textAlign = "center";
  const vals = [0.45, 0.72, 0.56, 0.93, 0.64];
  const cols = [TEAL_PALE, TEAL_SOFT, TEAL, CLAY, CLAY_SOFT];
  const bw = 62;
  const gap = (right - left - 40 - bw * vals.length) / (vals.length - 1);
  const tops: [number, number][] = [];
  vals.forEach((v, i) => {
    const x = left + 20 + i * (bw + gap);
    const bh = v * (base - top);
    tops.push([x + bw / 2, base - bh - 34]);
    shadowed(c, () => {
      c.fillStyle = cols[i];
      rr(c, x, base - bh, bw, bh, [14, 14, 4, 4]);
      c.fill();
    }, 18, 8);
    c.fillStyle = SOFT;
    c.fillText("ABCDE"[i], x + bw / 2, base + 34);
  });
  c.textAlign = "left";
  c.fillStyle = INK;
  c.fillRect(left, base, right - left, 4);
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
  c.fillStyle = SOFT;
  c.font = `400 18px ${f.sans}`;
  c.fillText("Stream", (left + right) / 2 - 30, base + 70);
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
  // running head, outer side, over a hairline
  const outerX = atLeft ? W - 100 : 100;
  const innerX = atLeft ? 150 : W - 150;
  c.fillStyle = SOFT;
  c.font = `italic 400 26px ${f.serif}`;
  c.textAlign = atLeft ? "right" : "left";
  c.fillText(spec.kind === "heading" ? "The MargaLink path" : spec.spread.tool, outerX, 96);
  c.textAlign = "left";
  c.fillStyle = LINE;
  c.fillRect(Math.min(outerX, innerX), 116, Math.abs(outerX - innerX), 2);
  const off = atLeft ? 30 : -30;
  if (spec.kind === "heading") heading(c, W, H, spec.spread, spec.spine, f);
  else {
    if (spec.spread.art === "review") artReview(c, W, off, f);
    else if (spec.spread.art === "write") artWrite(c, W, off, f);
    else artFigures(c, W, off, f);
    // the figure caption
    c.fillStyle = SOFT;
    c.font = `italic 400 30px ${f.serif}`;
    const text = `Fig. ${Number(spec.spread.n)} — ${spec.spread.caption}`;
    wrap(c, text, W - 250).forEach((line, i) => c.fillText(line, 150, H - 196 + i * 40));
  }
  // page number, outer corner
  c.fillStyle = SOFT;
  c.font = `400 26px ${f.mono}`;
  c.textAlign = atLeft ? "right" : "left";
  c.fillText(String(spec.page), atLeft ? W - 90 : 90, H - 90);
  c.textAlign = "left";
}
