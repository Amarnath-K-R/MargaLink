"use client";

import { Download } from "lucide-react";

// The compiled PDF on a paper sheet, in the browser's own viewer (zoom,
// search, print). The last good PDF stays while a newer compile fails.
// Before the first compile the sheet shows a sketch of a page, and `hint`.
export default function PdfPane({ url, name, hint }: { url: string | null; name: string; hint?: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between px-1.5 text-xs text-ink-soft">
        <span className="font-medium">PDF</span>
        {url && (
          <a href={url} download={name} className="clay-btn h-7 px-2.5 text-xs">
            <Download size={12} strokeWidth={2.2} />
            Download PDF
          </a>
        )}
      </div>
      <div className="sheet min-h-0 flex-1">
        {url ? (
          <iframe data-testid="pdf-frame" title="Compiled PDF" src={url} className="h-full w-full border-0 bg-white" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div aria-hidden className="mb-6 w-40 opacity-80">
              <div className="mx-auto h-2.5 w-28 rounded-full bg-accent/60" />
              <div className="mx-auto mt-2 h-1.5 w-20 rounded-full bg-ink/15" />
              <div className="mt-5 space-y-2">
                {[100, 94, 98, 88, 62].map((w, i) => (
                  <div key={i} className="h-1.5 rounded-full bg-ink/10" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
            <p className="font-serif text-lg text-ink">Your PDF appears here.</p>
            <p className="mt-1.5 text-sm text-ink-soft">
              Press Compile, or <kbd className="clay-key h-6 min-w-0 cursor-default px-1.5 text-[11px]">⌘S</kbd> in the editor.
            </p>
            {hint && <p className="mt-3 max-w-xs text-xs leading-relaxed text-ink-soft">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
