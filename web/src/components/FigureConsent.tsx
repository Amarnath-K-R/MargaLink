"use client";

// The one place in the figure feature where a plain-language notice and an
// explicit confirm action are non-negotiable (CLAUDE.md rule 3: "any
// feature that sends text out of the browser is opt-in, with a plain
// language notice first"). No default-on path — onConfirm only fires from a
// real click.
//
// Session-scoped (see figure.ts's figureConsentGiven()/recordFigureConsent()),
// except that the group-label opt-in is never remembered: when it's ticked,
// this notice lists the exact labels that would be added. Deliberately its
// own component rather than a shared one, so a reviewer can open one file
// and read verbatim what a user was told.
export default function FigureConsent({
  labels,
  onConfirm,
  onCancel,
}: {
  labels: Record<string, string[]> | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-sm border border-line bg-paper-alt p-4" role="alertdialog" aria-label="Ask Claude consent">
      <p className="text-sm font-medium">Send a description of your data and figure to Claude?</p>
      <p className="mt-2 text-sm text-ink-soft">
        This sends your column names, their types, the row count and the request you typed to Anthropic&apos;s Claude API. Claude also
        receives the current figure description (chart types, column bindings, axis settings) — never titles or notes you typed, never
        values. Claude replies with a new figure description (or a short piece of code, for a custom tweak), which is then drawn in your
        browser against your real data. Anthropic&apos;s API doesn&apos;t use this to train models; MargaLink doesn&apos;t store it. This
        notice won&apos;t show again this session — the exact request is shown on the page before every call regardless.
      </p>
      {labels && (
        <div className="mt-3 text-sm" data-testid="consent-labels">
          <p className="font-medium">You also chose to send these group labels:</p>
          <ul className="mt-1 list-disc pl-5 text-ink-soft">
            {Object.entries(labels).map(([col, lv]) => (
              <li key={col}>
                {col}: {lv.join(", ")}
              </li>
            ))}
          </ul>
          {Object.keys(labels).length === 0 && <p className="text-ink-soft">(none of your columns qualify, so no labels will be sent)</p>}
        </div>
      )}
      <div className="mt-3 flex gap-4 text-sm">
        <button type="button" onClick={onConfirm} className="text-accent hover:underline">
          Send it and ask Claude
        </button>
        <button type="button" onClick={onCancel} className="text-ink-soft hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
