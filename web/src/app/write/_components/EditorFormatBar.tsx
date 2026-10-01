"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Hash, Heading, Image as ImageIcon, Italic, List, ListOrdered, Percent, Quote, Sigma, Superscript, Table } from "lucide-react";
import { tableSnippet } from "@/lib/write/texSource";

// The formatting bar over the source: the LaTeX a writer reaches for most,
// one click away. Buttons wrap the selection (or insert a placeholder and
// select it); the ▾ ones open a small list — the project's own .bib keys,
// labels and figures, a table size. Everything here edits the open file;
// nothing is fetched.
const SECTIONS = [
  { cmd: "section", label: "Section" },
  { cmd: "subsection", label: "Subsection" },
  { cmd: "subsubsection", label: "Subsubsection" },
  { cmd: "paragraph", label: "Paragraph" },
] as const;

type Pop = "section" | "cite" | "ref" | "figure" | "table";

const BTN =
  "grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-ink-soft transition-colors hover:bg-white/80 hover:text-ink aria-expanded:bg-accent-soft aria-expanded:text-accent";

export default function EditorFormatBar({
  onWrap,
  onBlock,
  onComment,
  onInsert,
  entries,
  labels,
  figures,
  onOpenFigures,
}: {
  onWrap: (before: string, after: string, placeholder: string) => void;
  onBlock: (text: string, select?: string) => void;
  onComment: () => void;
  onInsert: (value: string) => void; // "cite:key" | "ref:label" | "fig:path", as the workspace's Insert handles them
  entries: { key: string; title: string | null }[];
  labels: string[];
  figures: string[];
  onOpenFigures: () => void;
}) {
  const [open, setOpen] = useState<Pop | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const toggle = (p: Pop) => setOpen((o) => (o === p ? null : p));
  const done = (fn: () => void) => () => {
    setOpen(null);
    fn();
  };

  return (
    <div ref={bar} role="toolbar" aria-label="Formatting" className="clay relative flex flex-wrap items-center gap-0.5 rounded-full px-1.5 py-1">
      <button type="button" className={BTN} aria-label="Bold" title="Bold (⌘B)" onClick={() => onWrap("\\textbf{", "}", "bold text")}>
        <Bold size={14} strokeWidth={2.2} />
      </button>
      <button type="button" className={BTN} aria-label="Italic" title="Italic (⌘I)" onClick={() => onWrap("\\textit{", "}", "italic text")}>
        <Italic size={14} strokeWidth={2.2} />
      </button>
      <Popover id="section" open={open} onToggle={toggle} label="Section" title="Section heading" icon={<Heading size={14} strokeWidth={2.2} />}>
        {SECTIONS.map((s) => (
          <PopItem key={s.cmd} onClick={done(() => onBlock(`\\${s.cmd}{Title}`, "Title"))}>
            <span className="font-mono text-xs text-ink-soft">\{s.cmd}</span> {s.label}
          </PopItem>
        ))}
      </Popover>
      <Divider />
      <button type="button" className={BTN} aria-label="Bulleted list" title="Bulleted list" onClick={() => onBlock("\\begin{itemize}\n  \\item First point\n\\end{itemize}", "First point")}>
        <List size={15} strokeWidth={2.2} />
      </button>
      <button type="button" className={BTN} aria-label="Numbered list" title="Numbered list" onClick={() => onBlock("\\begin{enumerate}\n  \\item First step\n\\end{enumerate}", "First step")}>
        <ListOrdered size={15} strokeWidth={2.2} />
      </button>
      <Divider />
      <button type="button" className={`${BTN} font-mono text-[11px]`} aria-label="Inline maths" title="Inline maths ($…$)" onClick={() => onWrap("$", "$", "x")}>
        $x$
      </button>
      <button type="button" className={BTN} aria-label="Equation" title="Numbered equation" onClick={() => onBlock("\\begin{equation}\n  E = mc^2\n  \\label{eq:label}\n\\end{equation}", "E = mc^2")}>
        <Sigma size={14} strokeWidth={2.2} />
      </button>
      <button type="button" className={BTN} aria-label="Footnote" title="Footnote" onClick={() => onWrap("\\footnote{", "}", "Footnote text.")}>
        <Superscript size={14} strokeWidth={2.2} />
      </button>
      <Divider />
      <Popover id="cite" open={open} onToggle={toggle} label="Cite" title="Cite a reference from your .bib files" icon={<Quote size={14} strokeWidth={2.2} />} wide>
        <Searchable
          items={entries.map((e) => ({ id: e.key, text: e.key, detail: e.title }))}
          empty="No .bib entries yet. Add a .bib file (New file → refs.bib) and its keys appear here."
          onPick={(key) => done(() => onInsert(`cite:${key}`))()}
        />
      </Popover>
      <Popover id="ref" open={open} onToggle={toggle} label="Ref" title="Refer to a label" icon={<Hash size={14} strokeWidth={2.2} />} wide>
        <Searchable
          items={labels.map((l) => ({ id: l, text: l, detail: null }))}
          empty="No \label{…} in your .tex files yet."
          onPick={(label) => done(() => onInsert(`ref:${label}`))()}
        />
      </Popover>
      <Popover id="figure" open={open} onToggle={toggle} label="Figure" title="Place a figure from figures/" icon={<ImageIcon size={14} strokeWidth={2.2} />}>
        {figures.length === 0 ? (
          <div className="p-2 text-xs leading-relaxed text-ink-soft">
            No figures yet. Make one, or upload an image into figures/.
            <button type="button" className="clay-btn mt-2 h-7 w-full justify-center text-xs" onClick={done(onOpenFigures)}>
              Open Figures
            </button>
          </div>
        ) : (
          figures.map((f) => (
            <PopItem key={f} onClick={done(() => onInsert(`fig:${f}`))}>
              <span className="font-mono text-xs">{f.replace(/^figures\//, "")}</span>
            </PopItem>
          ))
        )}
      </Popover>
      <Popover id="table" open={open} onToggle={toggle} label="Table" title="Table" icon={<Table size={14} strokeWidth={2.2} />}>
        <TablePicker onPick={(r, c) => done(() => onBlock(tableSnippet(r, c), "Caption."))()} />
      </Popover>
      <Divider />
      <button type="button" className={BTN} aria-label="Comment" title="Comment or uncomment lines (⌘/)" onClick={onComment}>
        <Percent size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />;
}

function Popover({
  id,
  open,
  onToggle,
  label,
  title,
  icon,
  wide = false,
  children,
}: {
  id: Pop;
  open: Pop | null;
  onToggle: (p: Pop) => void;
  label: string;
  title: string;
  icon: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="relative">
      <button type="button" className={`${BTN} gap-0.5`} aria-label={label} title={title} aria-expanded={open === id} aria-haspopup="true" onClick={() => onToggle(id)}>
        {icon}
      </button>
      {open === id && (
        <div className={`clay absolute right-0 top-9 z-40 rounded-2xl p-1.5 text-sm ${wide ? "w-80" : "w-56"}`} role="menu" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  );
}

function PopItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-accent-soft">
      {children}
    </button>
  );
}

function Searchable({ items, empty, onPick }: { items: { id: string; text: string; detail: string | null }[]; empty: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  if (items.length === 0) return <p className="p-2 text-xs leading-relaxed text-ink-soft">{empty}</p>;
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => !needle || i.text.toLowerCase().includes(needle) || i.detail?.toLowerCase().includes(needle)).slice(0, 50);
  return (
    <>
      <input
        autoFocus
        aria-label="Filter"
        placeholder="Filter…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && shown[0] && onPick(shown[0].id)}
        className="clay-input mb-1 h-8 w-full py-0 text-xs"
      />
      <div className="max-h-64 overflow-auto">
        {shown.length === 0 && <p className="p-2 text-xs text-ink-soft">No match.</p>}
        {shown.map((i) => (
          <PopItem key={i.id} onClick={() => onPick(i.id)}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-xs">{i.text}</span>
              {i.detail && <span className="truncate text-xs text-ink-soft">{i.detail}</span>}
            </span>
          </PopItem>
        ))}
      </div>
    </>
  );
}

// Hover to size a table, click to place it: up to 8 × 6.
function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [at, setAt] = useState<{ r: number; c: number }>({ r: 3, c: 3 });
  return (
    <div className="p-1.5">
      <div className="grid grid-cols-6 gap-1" onMouseLeave={() => setAt({ r: 3, c: 3 })}>
        {Array.from({ length: 8 * 6 }, (_, i) => {
          const r = Math.floor(i / 6) + 1;
          const c = (i % 6) + 1;
          const on = r <= at.r && c <= at.c;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r} by ${c} table`}
              onMouseEnter={() => setAt({ r, c })}
              onFocus={() => setAt({ r, c })}
              onClick={() => onPick(r, c)}
              className={`h-5 rounded-[5px] transition-colors ${on ? "bg-accent/70" : "bg-[#e6e2d8] shadow-[inset_0_1px_2px_rgba(58,44,28,.12)]"}`}
            />
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">
        {at.r} rows × {at.c} columns
      </p>
    </div>
  );
}
