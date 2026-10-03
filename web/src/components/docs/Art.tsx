import type { ReactNode } from "react";

// Small clay illustrations for the guide: one per tool, in the homepage's
// palette (paper, sand, teal, clay), soft top-left light, warm shadows.
// Inline SVG, no images; each has its own id prefix so several can share a
// page. Decorative — the text beside each says the same thing. `bare` drops
// the clay frame and fills its box, for a caller that frames and sizes it.

const C = {
  paper: "#fbfaf6",
  sand: "#ecdcc0",
  wood: "#e4c49a",
  teal: "#2c5f6f",
  tealSoft: "#6f98a2",
  tealPale: "#cfe0e1",
  clay: "#c27a5c",
  claySoft: "#f1d2c2",
  cream: "#efe3cf",
  line: "#d8d5cc",
  ink: "#2a2f38",
};

function Frame({ id, label, bare = false, children }: { id: string; label: string; bare?: boolean; children: ReactNode }) {
  return (
    <figure className={bare ? "h-full overflow-hidden rounded-[18px]" : "clay overflow-hidden rounded-[22px] p-2"}>
      {/* Bare, it fills its box (scaled to fit, centred), for a caller that sizes it. */}
      <svg viewBox="0 0 320 220" role="img" aria-label={label} className={bare ? "block h-full w-full" : "block h-auto w-full"}>
        <defs>
          <radialGradient id={`${id}-desk`} cx="30%" cy="0%" r="120%">
            <stop offset="0" stopColor="#f7f6f1" />
            <stop offset="1" stopColor="#e9e5db" />
          </radialGradient>
          <linearGradient id={`${id}-clay`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#fefdf9" />
            <stop offset="1" stopColor="#ebe8df" />
          </linearGradient>
          <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#3a2c1c" floodOpacity="0.16" />
          </filter>
          <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#3a2c1c" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width="320" height="220" rx="16" fill={`url(#${id}-desk)`} />
        {children}
      </svg>
    </figure>
  );
}

// Text lines on a sheet: widths as fractions of `w`.
function Lines({ x, y, w, widths, gap = 9, color = C.line, h = 3.5 }: { x: number; y: number; w: number; widths: number[]; gap?: number; color?: string; h?: number }) {
  return (
    <>
      {widths.map((f, i) => (
        <rect key={i} x={x} y={y + i * gap} width={w * f} height={h} rx={h / 2} fill={color} />
      ))}
    </>
  );
}

export function JournalsArt({ bare = false }: { bare?: boolean }) {
  const id = "art-j";
  const books = [
    { x: 58, h: 92, c: C.tealPale },
    { x: 84, h: 108, c: C.teal },
    { x: 112, h: 84, c: C.sand },
    { x: 136, h: 100, c: C.claySoft },
    { x: 162, h: 90, c: C.cream },
    { x: 186, h: 104, c: C.tealSoft },
  ];
  return (
    <Frame id={id} bare={bare} label="A shelf of journals, one being looked at through a magnifier">
      <ellipse cx="160" cy="186" rx="130" ry="10" fill="#3a2c1c" opacity="0.07" />
      <rect x="40" y="168" width="240" height="14" rx="7" fill={C.wood} filter={`url(#${id}-shadow)`} />
      {books.map((b, i) => (
        <g key={i} filter={`url(#${id}-soft)`}>
          <rect x={b.x} y={168 - b.h} width="22" height={b.h} rx="5" fill={b.c} />
          <rect x={b.x + 5} y={168 - b.h + 14} width="12" height="3" rx="1.5" fill="#fff" opacity="0.55" />
          <rect x={b.x + 5} y={168 - b.h + 21} width="8" height="3" rx="1.5" fill="#fff" opacity="0.4" />
        </g>
      ))}
      <g transform="rotate(14 222 120)" filter={`url(#${id}-soft)`}>
        <rect x="212" y="72" width="22" height="96" rx="5" fill={C.sand} />
        <rect x="217" y="86" width="12" height="3" rx="1.5" fill="#fff" opacity="0.55" />
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <circle cx="236" cy="78" r="30" fill={`url(#${id}-clay)`} />
        <circle cx="236" cy="78" r="20" fill="#e6f0f0" stroke={C.teal} strokeWidth="5" />
        <path d="M228 70 a12 12 0 0 1 14 -2" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="256" y="98" width="30" height="11" rx="5.5" transform="rotate(42 256 98)" fill={C.teal} />
      </g>
    </Frame>
  );
}

export function MatchArt({ bare = false }: { bare?: boolean }) {
  const id = "art-m";
  return (
    <Frame id={id} bare={bare} label="A paper connected by a dashed path to three journal cards, the best one marked in teal">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="28" y="36" width="104" height="140" rx="8" fill={C.paper} />
      </g>
      <rect x="42" y="52" width="60" height="6" rx="3" fill={C.teal} opacity="0.75" />
      <Lines x={42} y={68} w={76} widths={[1, 0.9, 0.95, 0.7]} />
      <Lines x={42} y={112} w={76} widths={[1, 0.85, 0.92, 0.6, 0.8]} />
      <path d="M132 104 C 160 104, 160 64, 188 60 M132 104 C 165 106, 165 108, 188 110 M132 104 C 160 104, 160 152, 188 160" stroke={C.tealSoft} strokeWidth="2" strokeDasharray="4 5" fill="none" strokeLinecap="round" />
      {[
        { y: 40, pill: C.teal, pillText: "#fff", w: 40 },
        { y: 90, pill: C.sand, pillText: C.ink, w: 34 },
        { y: 140, pill: "#e3dfd5", pillText: "#6b6f78", w: 30 },
      ].map((c, i) => (
        <g key={i} filter={`url(#${id}-shadow)`}>
          <rect x="190" y={c.y} width="104" height="40" rx="12" fill={`url(#${id}-clay)`} />
          <circle cx="206" cy={c.y + 20} r="7" fill={i === 0 ? C.tealPale : "#ebe8df"} />
          <rect x="218" y={c.y + 13} width="36" height="4" rx="2" fill={C.ink} opacity="0.55" />
          <rect x="218" y={c.y + 22} width="26" height="3" rx="1.5" fill={C.line} />
          <rect x={286 - c.w} y={c.y + 14} width={c.w - 4} height="12" rx="6" fill={c.pill} />
          <rect x={290 - c.w} y={c.y + 18.5} width={c.w - 12} height="3" rx="1.5" fill={c.pillText} opacity="0.8" />
        </g>
      ))}
    </Frame>
  );
}

export function ReviewArt({ bare = false }: { bare?: boolean }) {
  const id = "art-r";
  return (
    <Frame id={id} bare={bare} label="A paper with highlighted passages and margin notes">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="46" y="24" width="140" height="172" rx="8" fill={C.paper} />
      </g>
      <rect x="62" y="40" width="80" height="6" rx="3" fill={C.ink} opacity="0.6" />
      <Lines x={62} y={56} w={108} widths={[1, 0.92, 0.97]} />
      <rect x="58" y="81" width="116" height="12" rx="4" fill={C.tealPale} />
      <Lines x={62} y={85} w={108} widths={[0.88]} color={C.tealSoft} />
      <Lines x={62} y={102} w={108} widths={[1, 0.8, 0.95]} />
      <rect x="58" y="127" width="92" height="12" rx="4" fill={C.sand} />
      <Lines x={62} y={131} w={108} widths={[0.72]} color={C.wood} />
      <Lines x={62} y={148} w={108} widths={[1, 0.9, 0.6]} />
      {[
        { y: 60, bead: C.teal, mark: "check" },
        { y: 118, bead: C.wood, mark: "bang" },
      ].map((n, i) => (
        <g key={i} filter={`url(#${id}-shadow)`}>
          <path d={`M190 ${n.y + 26} L178 ${n.y + 30} L190 ${n.y + 20} Z`} fill="#f4f1ea" />
          <rect x="188" y={n.y} width="100" height="46" rx="14" fill={`url(#${id}-clay)`} />
          <circle cx="206" cy={n.y + 23} r="9" fill={n.bead} />
          {n.mark === "check" ? (
            <path d={`M202 ${n.y + 23} l3 3 l6 -6`} stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d={`M206 ${n.y + 18} v6 M206 ${n.y + 28} v0.5`} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          )}
          <rect x="222" y={n.y + 15} width="54" height="4" rx="2" fill={C.ink} opacity="0.5" />
          <rect x="222" y={n.y + 25} width="40" height="3" rx="1.5" fill={C.line} />
        </g>
      ))}
    </Frame>
  );
}

export function FiguresArt({ bare = false }: { bare?: boolean }) {
  const id = "art-f";
  const bars = [
    { x: 150, h: 46, c: C.tealPale },
    { x: 180, h: 78, c: C.tealSoft },
    { x: 210, h: 104, c: C.teal },
    { x: 240, h: 62, c: C.clay },
  ];
  return (
    <Frame id={id} bare={bare} label="A spreadsheet behind a chart of rounded clay bars">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="24" y="30" width="118" height="130" rx="8" fill="#f4efe3" />
      </g>
      {[0, 1, 2, 3, 4, 5, 6].map((r) => (
        <line key={r} x1="24" x2="142" y1={52 + r * 16} y2={52 + r * 16} stroke={C.line} strokeWidth="1" />
      ))}
      {[1, 2].map((c) => (
        <line key={c} x1={24 + c * 39} x2={24 + c * 39} y1="30" y2="160" stroke={C.line} strokeWidth="1" />
      ))}
      <rect x="24" y="30" width="118" height="22" rx="8" fill={C.sand} opacity="0.7" />
      <g filter={`url(#${id}-shadow)`}>
        <rect x="128" y="44" width="160" height="150" rx="10" fill={C.paper} />
      </g>
      <line x1="144" y1="176" x2="274" y2="176" stroke={C.ink} strokeWidth="1.5" opacity="0.5" />
      <line x1="144" y1="60" x2="144" y2="176" stroke={C.ink} strokeWidth="1.5" opacity="0.5" />
      {bars.map((b, i) => (
        <g key={i} filter={`url(#${id}-soft)`}>
          <rect x={b.x} y={176 - b.h} width="22" height={b.h} rx="6" fill={b.c} />
          <line x1={b.x + 11} x2={b.x + 11} y1={176 - b.h - 12} y2={176 - b.h + 6} stroke={C.ink} strokeWidth="1.5" opacity="0.55" />
          <line x1={b.x + 6} x2={b.x + 16} y1={176 - b.h - 12} y2={176 - b.h - 12} stroke={C.ink} strokeWidth="1.5" opacity="0.55" />
        </g>
      ))}
      <path d="M161 116 h60 M161 116 v-6 M221 116 v-6" stroke={C.ink} strokeWidth="1.2" fill="none" opacity="0.5" />
      <circle cx="191" cy="104" r="2" fill={C.ink} opacity="0.5" />
      <circle cx="196" cy="104" r="2" fill={C.ink} opacity="0.5" />
    </Frame>
  );
}

export function WriteArt({ bare = false }: { bare?: boolean }) {
  const id = "art-w";
  return (
    <Frame id={id} bare={bare} label="The writing workspace: a tray of tools above the LaTeX source and the compiled PDF">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="20" y="18" width="280" height="30" rx="15" fill={`url(#${id}-clay)`} />
      </g>
      <rect x="30" y="25" width="16" height="16" rx="5" fill={C.teal} />
      {[C.tealPale, C.sand, C.claySoft, "#dde6e6"].map((c, i) => (
        <circle key={i} cx={128 + i * 26} cy="33" r="7" fill={c} />
      ))}
      <rect x="242" y="25" width="50" height="16" rx="8" fill={C.teal} />
      <g filter={`url(#${id}-shadow)`}>
        <rect x="20" y="60" width="136" height="146" rx="9" fill={C.paper} />
        <rect x="164" y="60" width="136" height="146" rx="9" fill={C.paper} />
      </g>
      {[
        [C.teal, 40, C.line, 50],
        [C.teal, 30, C.line, 64],
        [C.clay, 24, C.line, 44],
        [C.line, 90, C.line, 0],
        [C.teal, 44, C.tealSoft, 30],
        [C.line, 96, C.line, 0],
        [C.line, 80, C.line, 0],
        [C.clay, 36, C.line, 40],
        [C.line, 70, C.line, 0],
      ].map(([a, aw, b, bw], i) => (
        <g key={i}>
          <rect x="44" y={76 + i * 13} width={aw as number} height="4" rx="2" fill={a as string} opacity={a === C.line ? 1 : 0.7} />
          {(bw as number) > 0 && <rect x={48 + (aw as number)} y={76 + i * 13} width={bw as number} height="4" rx="2" fill={b as string} />}
          <rect x="30" y={76 + i * 13} width="6" height="4" rx="2" fill="#d6d2c8" />
        </g>
      ))}
      <rect x="198" y="78" width="68" height="6" rx="3" fill={C.ink} opacity="0.55" />
      <rect x="212" y="90" width="40" height="3" rx="1.5" fill={C.line} />
      <Lines x={180} y={104} w={104} widths={[1, 0.96, 0.9, 1, 0.7]} gap={8} h={3} />
      <rect x="180" y="148" width="104" height="40" rx="4" fill="#eef3f3" />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={192 + k * 30} y={180 - (k + 1) * 9} width="16" height={(k + 1) * 9} rx="3" fill={[C.tealPale, C.tealSoft, C.teal][k]} />
      ))}
    </Frame>
  );
}

export function PrivacyArt({ bare = false }: { bare?: boolean }) {
  const id = "art-p";
  return (
    <Frame id={id} bare={bare} label="Your device holds the paper; public files come in, and only three opt-in requests ever go out, each behind a notice">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="70" y="40" width="180" height="128" rx="18" fill={`url(#${id}-clay)`} />
      </g>
      <rect x="84" y="54" width="152" height="100" rx="10" fill="#f1eee6" />
      <g filter={`url(#${id}-soft)`}>
        <rect x="128" y="64" width="64" height="80" rx="5" fill={C.paper} />
      </g>
      <rect x="138" y="74" width="36" height="4" rx="2" fill={C.teal} opacity="0.7" />
      <Lines x={138} y={84} w={44} widths={[1, 0.9, 0.95, 0.7, 0.85]} gap={8} h={3} />
      <g filter={`url(#${id}-soft)`}>
        <circle cx="206" cy="132" r="14" fill={C.teal} />
        <rect x="199.5" y="130" width="13" height="10" rx="2.5" fill="#fff" />
        <path d="M202 130 v-3.5 a4 4 0 0 1 8 0 v3.5" stroke="#fff" strokeWidth="2" fill="none" />
      </g>
      <path d="M20 104 H 62" stroke={C.tealSoft} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M52 96 l10 8 l-10 8" stroke={C.tealSoft} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="116" width="44" height="4" rx="2" fill={C.line} />
      {[80, 106, 132].map((y) => (
        <path key={y} d={`M258 ${y} H 296`} stroke="#a15a3f" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
      ))}
      {[80, 106, 132].map((y) => (
        <g key={y} filter={`url(#${id}-soft)`}>
          <circle cx="276" cy={y} r="9" fill={`url(#${id}-clay)`} />
          <circle cx="276" cy={y} r="3.5" fill="#a15a3f" />
        </g>
      ))}
    </Frame>
  );
}

export function GuideArt({ bare = false }: { bare?: boolean }) {
  const id = "art-g";
  const marks = [
    { x: 58, y: 62 },
    { x: 150, y: 104 },
    { x: 96, y: 150 },
  ];
  return (
    <Frame id={id} bare={bare} label="A screen with numbered markers beside a list of numbered notes">
      <g filter={`url(#${id}-shadow)`}>
        <rect x="28" y="30" width="170" height="160" rx="12" fill={C.paper} />
      </g>
      <rect x="40" y="42" width="146" height="16" rx="8" fill="#f1eee6" />
      <rect x="46" y="47" width="8" height="6" rx="3" fill={C.teal} />
      {[C.tealPale, C.sand, C.claySoft].map((c, i) => (
        <circle key={i} cx={98 + i * 14} cy="50" r="4" fill={c} />
      ))}
      <rect x="40" y="70" width="70" height="44" rx="8" fill="#eef3f3" />
      <rect x="118" y="70" width="68" height="44" rx="8" fill="#f4efe3" />
      <Lines x={40} y={124} w={146} widths={[1, 0.9, 0.95, 0.6]} gap={9} />
      <rect x="40" y="164" width="52" height="14" rx="7" fill={C.teal} />
      {marks.map((m, i) => (
        <g key={i} filter={`url(#${id}-soft)`}>
          <circle cx={m.x} cy={m.y} r="9" fill={C.teal} stroke={C.paper} strokeWidth="2.5" />
          <text x={m.x} y={m.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" fontFamily="ui-monospace, monospace">
            {i + 1}
          </text>
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} filter={`url(#${id}-shadow)`}>
          <rect x="212" y={44 + i * 48} width="84" height="38" rx="12" fill={`url(#${id}-clay)`} />
          <circle cx="226" cy={63 + i * 48} r="7" fill={C.teal} />
          <text x="226" y={66 + i * 48} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#fff" fontFamily="ui-monospace, monospace">
            {i + 1}
          </text>
          <rect x="238" y={56 + i * 48} width="48" height="4" rx="2" fill={C.ink} opacity="0.5" />
          <rect x="238" y={65 + i * 48} width="34" height="3" rx="1.5" fill={C.line} />
        </g>
      ))}
    </Frame>
  );
}
