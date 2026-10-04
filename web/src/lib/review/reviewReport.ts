// The review's report, built in the browser from what the passes returned
// (reviewOrchestrator.ts): each section's findings by id, the editor's
// duplicates and verdicts applied, Fix these first resolved to findings that
// are shown. A finding can appear only once because every one has one id and
// one home. Also the report's Markdown (Download, Copy) and the check on a
// kept one. Pure.
import type { Citation, ChecklistResponse, EditorResponse, Finding, Quote, ReviewReport, ReviewTier, SectionResponse, Severity, ShownFinding } from "./reviewTypes.ts";

export const findingId = (chunk: string, i: number) => `${chunk}-f${i}`;

export type ReportInput = {
  chunks: { id: string; title: string }[];
  review: string[];
  skipped: { id: string; title: string }[];
  excluded: { id: string; title: string }[];
  sections: Record<string, SectionResponse>;
  failed: Record<string, string>;
  checklist: ChecklistResponse | null;
  checklistFailed: string | null;
  editor: EditorResponse | null;
  tier: ReviewTier;
  journalName: string | null;
  createdAt: string;
};

// Claude is asked for no em dashes; any that come back are shown as a comma (as Rewrite's notes).
const plain = (s: string) => s.replace(/\s*—\s*/g, ", ");
// Within a section, the major findings first, then minor, then suggestions (each kind in the reviewer's order).
const RANK: Record<Severity, number> = { major: 0, minor: 1, suggestion: 2 };
const bySeverity = (a: ShownFinding, b: ShownFinding) => RANK[a.severity] - RANK[b.severity];

export function assembleReport(x: ReportInput): ReviewReport {
  const titles = new Map(x.chunks.map((c) => [c.id, c.title]));
  const cite = (q: Quote): Citation => ({ quote: q.text, section: titles.get(q.chunk) ?? q.chunk, sectionId: q.chunk });
  const show = (f: Finding, id: string, softened = false): ShownFinding => ({
    ...f,
    id,
    title: plain(f.title),
    why: plain(f.why),
    suggestion: plain(f.suggestion),
    citations: f.quotes.map(cite),
    softened,
  });
  const ed = x.editor;
  const dropped = new Set(ed ? ed.verdicts.filter((v) => v.action === "drop").map((v) => v.id) : []);
  const gone = new Set([...dropped, ...(ed ? ed.duplicates.flatMap((d) => d.drop) : [])]);
  const soften = new Map(ed ? ed.verdicts.filter((v) => v.action === "soften").map((v) => [v.id, v] as const) : []);
  const shown = new Map<string, { finding: ShownFinding; section: string }>();

  const sections = x.review.map((id) => {
    const got = x.sections[id];
    const title = titles.get(id) ?? id;
    const findings = (got?.findings ?? []).flatMap((f, i) => {
      const fid = findingId(id, i);
      if (gone.has(fid)) return [];
      const v = soften.get(fid);
      const s = v ? show({ ...f, title: v.title, why: v.why, question: true }, fid, true) : show(f, fid);
      shown.set(fid, { finding: s, section: title });
      return [s];
    }).sort(bySeverity);
    const status: "done" | "failed" | "pending" = got ? "done" : id in x.failed ? "failed" : "pending";
    return { id, title, status, reason: x.failed[id] ?? null, verdict: got ? plain(got.verdict) : null, findings };
  });
  const acrossPaper = (ed?.acrossPaper ?? [])
    .map((f) => {
      const s = show(f, f.id);
      shown.set(f.id, { finding: s, section: ACROSS_THE_PAPER });
      return s;
    })
    .sort(bySeverity);
  // A checklist item a finding already raises points to it (only to one still shown).
  const covered = new Map((ed?.checklistCovered ?? []).map((c) => [c.item, c.by]));
  const fixFirst = (ed?.fixFirst ?? []).flatMap((id) => {
    const hit = shown.get(id);
    return hit ? [{ id, title: hit.finding.title, severity: hit.finding.severity, section: hit.section }] : [];
  });
  const failed = sections.filter((s) => s.status === "failed").map((s) => ({ id: s.id, title: s.title, reason: s.reason ?? "" }));
  if (x.checklistFailed) failed.push({ id: "checklist", title: "Reporting checklist", reason: x.checklistFailed });

  return {
    version: 2,
    tier: x.tier,
    journalName: x.journalName,
    createdAt: x.createdAt,
    // No journal, and no notes describing one: the editor leaves the fit's explanation empty, and it isn't shown.
    overview: ed
      ? { text: plain(ed.overview), strengths: ed.strengths.map(plain), journalFit: ed.journalFit.explanation.trim() ? { ...ed.journalFit, explanation: plain(ed.journalFit.explanation) } : null }
      : null,
    fixFirst,
    sections,
    acrossPaper,
    checklist: x.checklist
      ? {
          guideline: x.checklist.guideline,
          why: plain(x.checklist.why),
          items: x.checklist.items.map(({ quote, ...it }, i) => {
            const by = covered.get(`c${i}`);
            const hit = by ? shown.get(by) : undefined;
            return { ...it, note: plain(it.note), citation: quote ? cite(quote) : null, coveredBy: hit ? { id: by!, title: hit.finding.title, section: hit.section } : null };
          }),
        }
      : null,
    coverage: {
      reviewed: sections.filter((s) => s.status === "done").map(({ id, title }) => ({ id, title })),
      failed,
      pending: sections.filter((s) => s.status === "pending").map(({ id, title }) => ({ id, title })),
      skipped: [...x.skipped, ...x.excluded.map((s) => ({ id: s.id, title: `${s.title} (excluded by you)` }))],
      setAside: dropped.size,
    },
  };
}

export function coverageLine({ reviewed, failed, pending, skipped, setAside }: ReviewReport["coverage"]): string {
  const sections = failed.filter((f) => f.id !== "checklist");
  let line = `Reviewed ${reviewed.length} of ${reviewed.length + sections.length + pending.length} sections`;
  if (failed.length) line += `; ${failed.map((f) => `${f.title} couldn't be checked (${f.reason})`).join("; ")}`;
  if (pending.length) line += `; ${pending.length} not reviewed yet`;
  if (setAside) line += `; ${setAside} finding${setAside === 1 ? "" : "s"} set aside on a second look`;
  if (skipped.length) line += `. Read for context only, or not sent: ${skipped.map((s) => s.title).join(", ")}`;
  return `${line}.`;
}

const LABEL: Record<Severity, string> = { major: "Major", minor: "Minor", suggestion: "Suggestion" };
export const ACROSS_THE_PAPER = "Across the paper";

/** Fix these first with each finding in full: where to make the change (its section, and the passages it quotes) and what to do. */
export function fixFirstDetails(r: ReviewReport): { item: ReviewReport["fixFirst"][number]; finding: ShownFinding | null; home: string | null }[] {
  const byId = new Map([...r.sections.flatMap((s) => s.findings), ...r.acrossPaper].map((f) => [f.id, f]));
  return r.fixFirst.map((item) => ({ item, finding: byId.get(item.id) ?? null, home: item.section === ACROSS_THE_PAPER ? null : item.section }));
}

/** Where a Fix these first item's change goes, in words. */
export function whereLine(d: ReturnType<typeof fixFirstDetails>[number]): string {
  if (!d.home) return d.finding && d.finding.citations.length > 1 ? `In ${d.finding.citations.length} places` : "Across the paper";
  return d.finding?.missing && d.finding.citations.length === 0 ? `${d.home}: something to add` : d.home;
}

export function reportMarkdown(r: ReviewReport): string {
  // Each part of a finding is its own paragraph: a line straight after a quote would join the quote.
  const finding = (f: ShownFinding) => [
    `- **${LABEL[f.severity]}: ${f.title}**`,
    "",
    ...f.citations.flatMap((c) => [`  > "${c.quote}" (${c.section})`, ""]),
    `  Why it matters: ${f.why}`,
    "",
    `  Suggestion: ${f.suggestion}`,
    "",
  ];
  const out = [
    `# Pre-submission review (${r.tier})${r.journalName ? ` for ${r.journalName}` : ""}`,
    "",
    `Generated by AI (Claude, by Anthropic) on ${r.createdAt.slice(0, 10)}: a second opinion to consider, not peer review. It can be wrong, so check it before you rely on it.`,
    "",
  ];
  if (r.overview) {
    out.push("## Overview", "", r.overview.text, "");
    if (r.overview.strengths.length) out.push("Strengths:", ...r.overview.strengths.map((s) => `- ${s}`), "");
    if (r.overview.journalFit) out.push(`Journal fit: ${r.overview.journalFit.assessment}. ${r.overview.journalFit.explanation}`, "");
  }
  if (r.fixFirst.length) {
    out.push("## Fix these first", "");
    fixFirstDetails(r).forEach((d, i) => {
      out.push(`${i + 1}. **${LABEL[d.item.severity]}: ${d.item.title}**`, "", `   Where: ${whereLine(d)}`, "");
      for (const c of d.finding?.citations ?? []) out.push(`   > "${c.quote}" (${c.section})`, "");
      if (d.finding) out.push(`   What to do: ${d.finding.suggestion}`, "");
    });
  }
  out.push("## Section by section", "");
  for (const s of r.sections) {
    out.push(`### ${s.title}`, "");
    if (s.status === "failed") out.push(`${s.title}: couldn't be reviewed (${s.reason})`, "");
    if (s.status === "pending") out.push("Not reviewed yet.", "");
    if (s.verdict) out.push(s.verdict, "");
    if (s.findings.length) out.push(...s.findings.flatMap(finding), "");
  }
  if (r.acrossPaper.length || r.checklist) {
    out.push("## Across the paper", "");
    if (r.acrossPaper.length) out.push(...r.acrossPaper.flatMap(finding), "");
    if (r.checklist) {
      out.push(`### Reporting checklist${r.checklist.guideline ? `: ${r.checklist.guideline}` : ""}`, "", r.checklist.why, "");
      out.push(
        ...r.checklist.items.flatMap((it) =>
          it.coveredBy
            ? [`- **${it.item}** (${it.status === "missing" ? "missing" : "partly reported"}): raised above, in ${it.coveredBy.section}: "${it.coveredBy.title}"`]
            : [`- **${it.item}** (${it.status === "missing" ? "missing" : "partly reported"}): ${it.note}`, ...(it.citation ? ["", `  > "${it.citation.quote}" (${it.citation.section})`, ""] : [])],
        ),
        "",
      );
    }
  }
  out.push("---", "", coverageLine(r.coverage), "");
  return out.join("\n");
}

/** A kept report (localStorage or the project's folder), or null if it isn't one this version can show. */
export function parseKept(json: string | null): ReviewReport | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as Partial<ReviewReport> | null;
    return r && r.version === 2 && Array.isArray(r.sections) && Array.isArray(r.fixFirst) && Array.isArray(r.acrossPaper) && !!r.coverage ? (r as ReviewReport) : null;
  } catch {
    return null;
  }
}
