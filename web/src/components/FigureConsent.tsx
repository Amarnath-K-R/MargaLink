"use client";

// The one place in the figure-generation feature where a plain-language
// notice and an explicit confirm action are non-negotiable (CLAUDE.md
// rule 3: "any feature that sends text out of the browser is opt-in,
// with a plain language notice first"). No default-on path — onConfirm
// only fires from a real click.
//
// Session-scoped (see figure.ts's figureConsentGiven()/recordFigureConsent()),
// not per-figure like ReviewConsent — deliberately its own component
// rather than a shared/generalized one: what's disclosed here is
// substantively different (a schema, never document content), and
// keeping each exception's actual notice text in its own small file
// means a reviewer can open one file and read verbatim what a user was
// told, rather than reconstructing it from a props bag.
export default function FigureConsent({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="mt-3 rounded-sm border border-line bg-paper-alt p-4"
      role="alertdialog"
      aria-label="Figure generation consent"
    >
      <p className="text-sm font-medium">Send your column names and chart choice to Claude?</p>
      <p className="mt-2 text-sm text-ink-soft">
        Unlike matching and the checks above, this sends a description of your spreadsheet — column
        names, inferred types, row count, the chart type you picked, and any style note you typed — to
        Anthropic&apos;s Claude API, which writes Python plotting code. Your spreadsheet&apos;s actual
        values never leave this tab: that code then runs locally, in your browser, against your real
        data. Anthropic&apos;s API doesn&apos;t use this to train models; MargaLink doesn&apos;t store
        it. This notice won&apos;t show again this session — the exact request is shown on the page
        before every generation regardless.
      </p>
      <div className="mt-3 flex gap-4 text-sm">
        <button type="button" onClick={onConfirm} className="text-accent hover:underline">
          Send it and generate
        </button>
        <button type="button" onClick={onCancel} className="text-ink-soft hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
