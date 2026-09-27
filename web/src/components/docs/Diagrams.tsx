import type { ReactNode } from "react";

// Diagrams for /architecture: the system overview (inline SVG, drawn to
// scale-free coordinates so it reads the same at any width) and numbered
// step cards for each tool's pipeline (HTML, so they wrap on a phone).

type Box = { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: "clay" | "sheet" | "away" };

function BoxShape({ b, id }: { b: Box; id: string }) {
  const fill = b.tone === "sheet" ? "#fbfaf6" : `url(#${id}-clay)`;
  return (
    <g filter={`url(#${id}-shadow)`}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="14" fill={fill} stroke={b.tone === "away" ? "#a15a3f" : "none"} strokeWidth={b.tone === "away" ? 1.5 : 0} />
      <text x={b.x + 14} y={b.y + 22} className="fill-ink font-sans" fontSize="13" fontWeight="600">
        {b.title}
      </text>
      {b.lines.map((l, i) => (
        <text key={i} x={b.x + 14} y={b.y + 42 + i * 17} className="fill-ink-soft font-sans" fontSize="11.5">
          {l}
        </text>
      ))}
    </g>
  );
}

function Arrow({ d, label, lx, ly, away = false, id }: { d: string; label: string; lx: number; ly: number; away?: boolean; id: string }) {
  const color = away ? "#a15a3f" : "#6f98a2";
  return (
    <g>
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeDasharray={away ? "5 5" : undefined} markerEnd={`url(#${id}-${away ? "head-away" : "head"})`} />
      <text x={lx} y={ly} className="font-sans" fontSize="11" fill={color} fontWeight="500">
        {label}
      </text>
    </g>
  );
}

export function SystemDiagram() {
  const id = "sys";
  const device: Box[] = [
    { x: 44, y: 70, w: 196, h: 92, title: "The tool pages", lines: ["Next.js static export, React", "Journals · Match · Review", "Figures · Write"], tone: "sheet" },
    { x: 256, y: 70, w: 196, h: 92, title: "Workers", lines: ["TeX Live (BusyTeX, WASM)", "Pyodide + figurelib.py", "pdf.js"] },
    { x: 44, y: 178, w: 196, h: 92, title: "On-device work", lines: ["read · embed · rank", "format & journal-rules checks", "LaTeX helpers, suggestions"] },
    { x: 256, y: 178, w: 196, h: 92, title: "Browser storage", lines: ["OPFS: projects, last PDF", "caches: index, model, engine", "localStorage: small settings"] },
    { x: 44, y: 290, w: 408, h: 66, title: "Consent notices — the only way out", lines: ["ReviewConsent · FigureConsent: nothing is sent until a click"], tone: "away" },
  ];
  const outside: Box[] = [
    { x: 566, y: 30, w: 240, h: 76, title: "Cloudflare Pages", lines: ["the static site, /index, /templates,", "the figure gallery"] },
    { x: 566, y: 124, w: 240, h: 94, title: "Public assets", lines: ["R2: TeX engine and packs", "jsDelivr: Pyodide, ONNX runtime", "Hugging Face: the embedding model"] },
    { x: 566, y: 250, w: 240, h: 76, title: "Pages Functions", lines: ["/api/review · /api/figure", "hold the API key; store nothing"] },
    { x: 566, y: 352, w: 240, h: 54, title: "Anthropic API", lines: ["Claude"] },
  ];
  return (
    <figure className="clay overflow-x-auto rounded-[22px] p-3">
      <svg viewBox="0 0 830 430" role="img" aria-label="MargaLink's system: everything runs in the browser on the user's device; public files come in from Cloudflare and CDNs; only the two opt-in features send anything out, through two Pages Functions to Anthropic." className="block h-auto w-full min-w-[640px]">
        <defs>
          <linearGradient id={`${id}-clay`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#fefdf9" />
            <stop offset="1" stopColor="#ece9e1" />
          </linearGradient>
          <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#3a2c1c" floodOpacity="0.14" />
          </filter>
          <marker id={`${id}-head`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#6f98a2" />
          </marker>
          <marker id={`${id}-head-away`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#a15a3f" />
          </marker>
        </defs>
        <rect x="24" y="20" width="448" height="392" rx="22" fill="#f1eee6" stroke="#6f98a2" strokeWidth="1.5" strokeDasharray="6 6" />
        <text x="44" y="50" className="fill-accent font-sans" fontSize="13" fontWeight="600">
          This device — the user&apos;s browser
        </text>
        {device.map((b) => (
          <BoxShape key={b.title} b={b} id={id} />
        ))}
        {outside.map((b) => (
          <BoxShape key={b.title} b={b} id={id} />
        ))}
        <Arrow id={id} d="M564 68 C 520 68, 510 100, 474 104" label="public files" lx={492} ly={62} />
        <Arrow id={id} d="M564 170 C 520 170, 510 130, 474 130" label="engines, model" lx={482} ly={186} />
        <Arrow id={id} d="M454 322 C 510 322, 520 288, 562 288" label="opt-in only" lx={478} ly={342} away />
        <Arrow id={id} d="M686 328 L 686 348" label="" lx={0} ly={0} away />
      </svg>
      <figcaption className="px-2 pt-3 text-xs leading-relaxed text-ink-soft">
        Solid arrows are bodyless GETs for public files. The dashed ones carry something of the user&apos;s — only after a notice, only for the AI review
        and Ask Claude.
      </figcaption>
    </figure>
  );
}

export type Step = { title: string; detail: ReactNode; files?: string; away?: boolean };

// A pipeline as numbered clay cards, in order; a step that sends something
// off the device is marked in the "leaves this device" colour.
export function Steps({ steps, tint = "#cfe0e1" }: { steps: Step[]; tint?: string }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {steps.map((s, i) => (
        <li key={i} className={`clay flex gap-3 rounded-2xl p-4 text-sm ${s.away ? "shadow-[inset_4px_0_0_#a15a3f]" : ""}`}>
          <span aria-hidden className="bead h-7 w-7 shrink-0 font-mono text-xs" style={{ background: s.away ? "#f1d2c2" : tint }}>
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{s.title}</p>
            <div className="mt-1 text-xs leading-relaxed text-ink-soft">{s.detail}</div>
            {s.files && <p className="mt-2 break-words font-mono text-[11px] text-accent">{s.files}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// The clay palette, as swatches.
export function Swatches({ colors }: { colors: { name: string; hex: string; use: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {colors.map((c) => (
        <div key={c.name} className="clay flex items-center gap-3 rounded-2xl p-3">
          <span aria-hidden className="block h-10 w-10 shrink-0 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,.5),inset_0_-2px_4px_rgba(0,0,0,.12),0_2px_5px_rgba(58,44,28,.18)]" style={{ background: c.hex }} />
          <div className="min-w-0 text-xs">
            <p className="font-medium text-ink">{c.name}</p>
            <p className="font-mono text-ink-soft">{c.hex}</p>
            <p className="text-ink-soft">{c.use}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
