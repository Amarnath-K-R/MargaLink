"use client";

// The compiled PDF in the browser's own viewer (zoom, search, print). The last
// good PDF stays while a newer compile fails.
export default function PdfPane({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center rounded-sm border border-dashed border-line p-6 text-center text-sm text-ink-soft">
        Compile to see your PDF here.
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <iframe data-testid="pdf-frame" title="Compiled PDF" src={url} className="w-full flex-1 rounded-sm border border-line bg-white" />
      <a href={url} download={name} className="mt-2 self-start text-sm text-accent hover:underline">
        Download PDF
      </a>
    </div>
  );
}
