"use client";

import type { Template } from "@/lib/figureTemplates";

// Starting points, each drawn from a sample dataset. Picking one rebinds it
// to your columns (figureTemplates.ts bindTemplate) — no request.
export default function Gallery({ templates, selected, onPick }: { templates: Template[]; selected: string | null; onPick: (t: Template) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" data-testid="gallery">
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          aria-pressed={selected === t.id}
          data-template={t.id}
          className={`rounded-sm border p-2 text-left text-sm transition-colors ${selected === t.id ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a static thumbnail; images are unoptimized in this static export */}
          <img src={`/figure-gallery/${t.id}.png`} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-sm bg-white object-contain" />
          <p className="mt-2 font-medium">{t.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{t.description}</p>
        </button>
      ))}
    </div>
  );
}
