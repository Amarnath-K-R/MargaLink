"use client";

import { useEffect, useState } from "react";
import ErrorText from "@/components/ErrorText";
import type { ImageFormat } from "@/lib/figureRunner";

const FORMATS: { value: ImageFormat; label: string; mime: string }[] = [
  { value: "png", label: "PNG", mime: "image/png" },
  { value: "tiff", label: "TIFF", mime: "image/tiff" },
  { value: "svg", label: "SVG", mime: "image/svg+xml" },
  { value: "pdf", label: "PDF", mime: "application/pdf" },
];

function toBlobUrl(base64: string, mime: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// Publication export at the journal width the style sets, drawn again at
// full resolution in the worker. Files are handed over as blob: URLs.
export default function ExportBar({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (formats: ImageFormat[], dpi: number) => Promise<Partial<Record<ImageFormat, string>>>;
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
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {FORMATS.map((f) => (
          <label key={f.value} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={formats.includes(f.value)}
              onChange={(e) => setFormats(e.target.checked ? [...formats, f.value] : formats.filter((x) => x !== f.value))}
            />
            {f.label}
          </label>
        ))}
        <label className="flex items-center gap-1.5">
          Resolution
          <select className="rounded-sm border border-line bg-paper px-2 py-1" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={300}>300 dpi</option>
            <option value={600}>600 dpi</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={disabled || busy || formats.length === 0}
          className="rounded-sm border border-line bg-paper-alt px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Exporting…" : "Export"}
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {links.map((l) => (
            <a key={l.format} href={l.url} download={`figure.${l.format}`} className="text-accent hover:underline">
              Download {l.format.toUpperCase()} ({l.kb.toLocaleString()} KB)
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
