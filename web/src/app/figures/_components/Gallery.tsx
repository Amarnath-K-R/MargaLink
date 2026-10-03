"use client";

import type { Template } from "@/lib/figures/figureTemplates";

// Starting points, each drawn from a sample dataset. Picking one rebinds it
// to your columns (figureTemplates.ts bindTemplate) — no request.
export default function Gallery({ templates, selected, onPick }: { templates: Template[]; selected: string | null; onPick: (t: Template) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3" data-testid="gallery">
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t)}
          aria-pressed={selected === t.id}
          data-template={t.id}
          className="clay-card p-2.5 text-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a static thumbnail; images are unoptimized in this static export */}
          <img src={`/figure-gallery/${t.id}.png`} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl bg-white object-contain shadow-[0_0_0_1px_rgba(58,44,28,.06)]" />
          <p className="mt-2.5 px-1 font-medium">{t.title}</p>
          <p className="mt-0.5 px-1 pb-1 text-xs leading-relaxed text-ink-soft">{t.description}</p>
        </button>
      ))}
    </div>
  );
}
