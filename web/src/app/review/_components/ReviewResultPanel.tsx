"use client";

import { useRef, useState } from "react";
import { coverageLine, fixFirstDetails, reportMarkdown, whereLine } from "@/lib/review/reviewReport";
import type { Citation, ReviewReport, Severity, ShownFinding } from "@/lib/review/reviewTypes";
import { downloadBytes } from "@/app/write/_components/download";

// Every quote shown here was found in the paper by the server
// (reviewGrounding.ts), and every finding has one id and one place
// (reviewReport.ts), so nothing shows twice. `onCitation` (the writing
// workspace): Jump to source finds the quoted passage in the paper.
const SEVERITY: Record<Severity, { label: string; tone: string }> = {
  major: { label: "Major", tone: "bg-[#f1d2c2] text-away" },
  minor: { label: "Minor", tone: "bg-[#ecdcc0] text-ink" },
  suggestion: { label: "Suggestion", tone: "bg-accent-soft text-ink" },
};

function Chip({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>;
}

// `home`: the section already named beside the quotes, so it isn't repeated after each one.
function Quotes({ citations, onCitation, home }: { citations: Citation[]; onCitation?: (c: Citation) => void; home?: string | null }) {
  if (citations.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {citations.map((c, i) => (
        <li key={i} className="border-l-2 border-accent/35 pl-3 text-xs italic leading-relaxed text-ink-soft">
          &ldquo;{c.quote}&rdquo; {c.section !== home && <span className="not-italic">({c.section})</span>}
          {onCitation && (
            <button type="button" onClick={() => onCitation(c)} className="clay-chip ml-2 h-6 not-italic" data-print-hide>
              Jump to source
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function FindingItem({ f, onCitation }: { f: ShownFinding; onCitation?: (c: Citation) => void }) {
  return (
    <article data-finding={f.id} tabIndex={-1} className="scroll-mt-24 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <p className="flex items-start gap-2 font-medium leading-snug">
        <Chip severity={f.severity} />
        <span>{f.title}</span>
      </p>
      {f.missing && f.citations.length === 0 && <p className="mt-1 text-xs text-ink-soft">About something the paper doesn&apos;t include.</p>}
      <Quotes citations={f.citations} onCitation={onCitation} />
      <p className="mt-2 leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">Why it matters: </span>
        {f.why}
      </p>
      <p className="mt-1 leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">Suggestion: </span>
        {f.suggestion}
      </p>
    </article>
  );
}

const counts = (fs: ShownFinding[]) => {
  const n = (s: Severity) => fs.filter((f) => f.severity === s).length;
  const parts = [n("major") && `${n("major")} major`, n("minor") && `${n("minor")} minor`, n("suggestion") && `${n("suggestion")} suggestion${n("suggestion") === 1 ? "" : "s"}`];
  return parts.filter(Boolean).join(", ") || "nothing to fix";
};

export default function ReviewResultPanel({
  report,
  partial = false,
  onCitation,
  onForget,
}: {
  report: ReviewReport;
  partial?: boolean;
  onCitation?: (c: Citation) => void;
  onForget?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const go = (id: string) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-finding="${id}"]`);
    el?.closest("details")?.setAttribute("open", "");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };
  const download = () => downloadBytes(`review-${report.tier}-${report.createdAt.slice(0, 10)}.md`, new TextEncoder().encode(reportMarkdown(report)), "text/markdown");
  // A copy of the report, every section open, straight under <body> (globals.css prints only that), so
  // it flows over as many pages as it needs instead of being cut to the window or panel it sits in.
  const print = () => {
    if (!ref.current) return;
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    const copy = ref.current.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
    for (const el of [copy, ...copy.querySelectorAll("[data-testid]")]) el.removeAttribute("data-testid"); // one report on the page, for anything that looks
    root.appendChild(copy);
    document.body.appendChild(root);
    const done = () => {
      root.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const copy = () =>
    void navigator.clipboard.writeText(reportMarkdown(report)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  const fit = report.overview?.journalFit;
  const fitTone = fit?.assessment === "good" ? "bg-accent text-white" : fit?.assessment === "poor" ? "bg-[#f1d2c2] text-away" : "bg-[#ecdcc0] text-ink";

  return (
    // data-generator: a machine-readable AI label on the output (EU AI Act Art. 50(2)).
    <div ref={ref} data-print-report data-testid="review-report" className="sheet mt-6 p-6 text-sm sm:p-8" data-generator="MargaLink AI review using Claude by Anthropic">
      {/* On paper the page around it is gone, so the report names itself. */}
      <h2 className="mb-3 hidden font-serif text-xl font-medium print:block">
        Pre-submission review ({report.tier}){report.journalName ? ` for ${report.journalName}` : ""},{" "}
        {new Date(report.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-accent">The review, generated by AI (Claude)</p>
        <div className="flex flex-wrap gap-2" data-print-hide>
          <button type="button" onClick={download} className="clay-chip h-7">
            Download
          </button>
          <button type="button" onClick={print} className="clay-chip h-7">
            Print or save as PDF
          </button>
          <button type="button" onClick={copy} className="clay-chip h-7">
            {copied ? "Copied" : "Copy"}
          </button>
          {onForget && (
            <button type="button" onClick={onForget} className="clay-chip h-7">
              Forget this report
            </button>
          )}
        </div>
      </div>

      <section className="mt-4" data-testid="review-overview">
        <h3 className="font-serif text-lg font-medium">Overview</h3>
        {report.overview ? (
          <>
            <p className="mt-2 leading-relaxed">{report.overview.text}</p>
            {report.overview.strengths.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
                {report.overview.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {fit && (
              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">Journal fit</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${fitTone}`}>{fit.assessment}</span>
                <span className="basis-full text-ink-soft">{fit.explanation}</span>
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-ink-soft">The overview, the journal fit and what to fix first come once every section is back.</p>
        )}
        {report.fixFirst.length > 0 && (
          <div className="mt-5" data-testid="review-fix-first">
            <p className="font-medium">Fix these first</p>
            <ol className="mt-2 space-y-2.5">
              {fixFirstDetails(report).map((d, i) => (
                <li key={d.item.id} className="break-inside-avoid rounded-xl border border-line/70 px-4 py-3">
                  <p className="flex items-start gap-2 font-medium leading-snug">
                    <span className="mt-0.5 w-4 shrink-0 tabular-nums text-ink-soft">{i + 1}.</span>
                    <Chip severity={d.item.severity} />
                    <span>{d.item.title}</span>
                  </p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 pl-6 sm:grid-cols-[6rem_1fr]">
                    <dt className="text-xs font-medium text-ink-soft sm:pt-0.5">Where</dt>
                    <dd className="min-w-0">
                      {whereLine(d)}
                      {d.finding && <Quotes citations={d.finding.citations} onCitation={onCitation} home={d.home} />}
                    </dd>
                    {d.finding && (
                      <>
                        <dt className="mt-1 text-xs font-medium text-ink-soft sm:mt-0 sm:pt-0.5">What to do</dt>
                        <dd className="leading-relaxed text-ink-soft">{d.finding.suggestion}</dd>
                      </>
                    )}
                  </dl>
                  <button type="button" onClick={() => go(d.item.id)} className="mt-2 ml-6 text-xs text-accent hover:underline" data-print-hide>
                    Why it matters
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="mt-6 border-t border-line/70 pt-5" data-testid="review-sections">
        <h3 className="font-serif text-lg font-medium">Section by section</h3>
        {report.sections.map((s) => (
          <details key={s.id} open={s.findings.some((f) => f.severity === "major")} className="mt-3 rounded-xl border border-line/70 px-4 py-2">
            <summary className="cursor-pointer py-1 font-medium">
              {s.title}{" "}
              <span className="font-normal text-ink-soft">
                ({s.status === "done" ? counts(s.findings) : s.status === "failed" ? `couldn't be reviewed: ${s.reason}` : "not reviewed yet"})
              </span>
            </summary>
            {s.verdict && <p className="mt-1 leading-relaxed text-ink-soft">{s.verdict}</p>}
            <div className="divide-y divide-line/60">
              {s.findings.map((f) => (
                <FindingItem key={f.id} f={f} onCitation={onCitation} />
              ))}
            </div>
          </details>
        ))}
      </section>

      {(report.acrossPaper.length > 0 || report.checklist) && (
        <section className="mt-6 border-t border-line/70 pt-5" data-testid="review-across">
          <h3 className="font-serif text-lg font-medium">Across the paper</h3>
          <div className="divide-y divide-line/60">
            {report.acrossPaper.map((f) => (
              <FindingItem key={f.id} f={f} onCitation={onCitation} />
            ))}
          </div>
          {report.checklist && (
            <div className="mt-4" data-testid="review-checklist">
              <p className="font-medium">Reporting checklist{report.checklist.guideline ? `: ${report.checklist.guideline}` : ""}</p>
              <p className="mt-1 text-ink-soft">{report.checklist.why}</p>
              <ul className="mt-2 space-y-2">
                {report.checklist.items.map((it, i) => (
                  <li key={i}>
                    <span className="font-medium">{it.item}</span>{" "}
                    <span className="text-ink-soft">
                      ({it.status === "missing" ? "missing" : "partly reported"}): {it.note}
                    </span>
                    {it.citation && <Quotes citations={[it.citation]} onCitation={onCitation} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="mt-6 border-t border-line/70 pt-4 text-xs text-ink-soft" data-testid="review-coverage">
        {coverageLine(report.coverage)}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        Generated by AI (Claude, by Anthropic): a second opinion to consider, not peer review and not a guarantee of anything. It can be wrong, so check it
        before you rely on it. Your journal may ask you to disclose AI assistance.
        {partial ? " Results so far; the overview comes once every section is back." : ""}
      </p>
    </div>
  );
}
