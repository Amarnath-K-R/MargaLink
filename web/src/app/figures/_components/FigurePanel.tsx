import ErrorText from "@/components/ErrorText";
import type { FigureImages } from "@/lib/figureRunner";

export default function FigurePanel({
  images,
  code,
  error,
  onRegenerate,
  busy,
}: {
  images: FigureImages | null;
  code: string | null;
  error: string | null;
  onRegenerate: () => void;
  busy: boolean;
}) {
  if (!code && !error) return null;

  return (
    <div className="mt-6">
      {images && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a
              base64 data: URI, generated at runtime; next/image's
              optimization is already fully disabled in next.config.ts
              (images.unoptimized: true) for this static export, so
              next/image would add a width/height contract for zero
              actual benefit here. */}
          <img
            data-testid="figure-image"
            src={`data:image/png;base64,${images.png}`}
            alt="Generated figure"
            className="max-w-full rounded-sm border border-line"
          />
          <div className="mt-2 flex gap-4 text-sm">
            <a href={`data:image/png;base64,${images.png}`} download="figure.png" className="text-accent hover:underline">
              Download PNG
            </a>
            <a href={`data:image/svg+xml;base64,${images.svg}`} download="figure.svg" className="text-accent hover:underline">
              Download SVG
            </a>
            <a href={`data:application/pdf;base64,${images.pdf}`} download="figure.pdf" className="text-accent hover:underline">
              Download PDF
            </a>
          </div>
        </div>
      )}

      {code && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent">Show the generated Python code</summary>
          <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-paper-alt p-3 text-xs">{code}</pre>
        </details>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      {code && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          className="mt-3 rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Working…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
