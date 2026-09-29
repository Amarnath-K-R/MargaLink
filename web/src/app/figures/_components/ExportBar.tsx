"use client";

import { useEffect, useState, type ReactNode } from "react";
import ErrorText from "@/components/ErrorText";
import type { ImageFormat } from "@/lib/figureRunner";

const FORMATS: { value: ImageFormat; label: string; mime: string }[] = [
  { value: "png", label: "PNG", mime: "image/png" },
  { value: "tiff", label: "TIFF", mime: "image/tiff" },
  // Download-only: an SVG blob opened in a tab would run in our origin, and
  // SVG can carry script. The file keeps its .svg name, so it opens as an image elsewhere.
  { value: "svg", label: "SVG", mime: "application/octet-stream" },
  { value: "pdf", label: "PDF", mime: "application/pdf" },
];

function toBlobUrl(base64: string, mime: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// Publication export at the journal width the style sets, drawn again at
// full resolution in the worker. Files are handed over as blob: URLs.
// `children` sits beside the Export button: the page's "Add to a paper",
// the writing workspace's "Insert into paper".
export default function ExportBar({
  disabled,
  onExport,
  children,
}: {
  disabled: boolean;
  onExport: (formats: ImageFormat[], dpi: number) => Promise<Partial<Record<ImageFormat, string>>>;
  children?: ReactNode;
}) {
  const [formats, setFormats] = useState<ImageFormat[]>(["png", "pdf"]);
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ format: ImageFormat; url: string; kb: number }[]>([]);

  useEffect(() => () => links.forEach((l) => URL.revokeObjectURL(l.url)), [links]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const images = await onExport(formats, dpi);
      setLinks(
        FORMATS.filter((f) => images[f.value]).map((f) => ({
          format: f.value,
          url: toBlobUrl(images[f.value]!, f.mime),
          kb: Math.round((images[f.value]!.length * 3) / 4 / 1024),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="export-bar">
      <div className="clay flex flex-wrap items-center gap-2 px-3 py-3 text-sm">
        {FORMATS.map((f) => (
          <label key={f.value} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 hover:bg-white/60 has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
            <input
              type="checkbox"
              checked={formats.includes(f.value)}
              onChange={(e) => setFormats(e.target.checked ? [...formats, f.value] : formats.filter((x) => x !== f.value))}
            />
            {f.label}
          </label>
        ))}
        <label className="flex items-center gap-2 pl-1 text-ink-soft">
          Resolution
          <select className="clay-field text-ink" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={300}>300 dpi</option>
            <option value={600}>600 dpi</option>
          </select>
        </label>
        <div className="mt-1 flex w-full flex-wrap items-start gap-2 border-t border-line/70 pt-3">
          <button
            type="button"
            onClick={() => void run()}
            disabled={disabled || busy || formats.length === 0}
            className="clay-btn clay-primary px-5 font-medium"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
          {children}
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {links.map((l) => (
            <a key={l.format} href={l.url} download={`figure.${l.format}`} className="clay-chip">
              Download {l.format.toUpperCase()} ({l.kb.toLocaleString()} KB)
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
