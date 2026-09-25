"use client";

import type { Template } from "@/lib/templateCatalog";

// Start a paper: a bundled template (compiles right away), or — for publishers
// that only distribute their own — a link to fetch it and upload the zip.
export default function TemplatePicker({
  templates,
  recommended,
  journalName,
  busy,
  onPick,
  onUpload,
}: {
  templates: Template[];
  recommended: Template | null;
  journalName: string | null;
  busy: boolean;
  onPick: (t: Template) => void;
  onUpload: () => void;
}) {
  const bundled = templates.filter((t) => t.bundled);
  const linked = templates.filter((t) => !t.bundled);
  return (
    <div data-testid="template-picker">
      {journalName && (
        <p className="mb-3 text-sm">
          For <span className="font-medium">{journalName}</span>
          {recommended ? (
            <>
              : we suggest <span className="font-medium">{recommended.name}</span>
              {!recommended.bundled && " — see the link below"}.
            </>
          ) : (
            ": its publisher has no template we know of, so the plain article is a good start."
          )}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {bundled.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(t)}
            data-template={t.id}
            className={`rounded-sm border p-3 text-left text-sm transition-colors disabled:opacity-60 ${recommended?.id === t.id ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"}`}
          >
            <p className="font-medium">{t.name}</p>
            <p className="mt-1 text-xs text-ink-soft">{t.note}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 text-sm">
        <p className="text-ink-soft">
          Other publishers share their templates only on their own sites — download the zip there, then{" "}
          <button type="button" onClick={onUpload} className="text-accent hover:underline">
            upload it here
          </button>
          :
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {linked.map((t) => (
            <li key={t.id} className={recommended?.id === t.id ? "font-medium" : ""}>
              <a href={t.publisherUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" title={t.note}>
                {t.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
