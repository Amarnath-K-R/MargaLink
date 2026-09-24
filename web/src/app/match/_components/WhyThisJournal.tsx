import type { RankedJournal } from "@/lib/rank";

// The reasons behind one result: the topics your paper shares with the
// journal's recent papers, how often you cite it, and which of its clusters
// of papers yours sits closest to.
export default function WhyThisJournal({ r }: { r: RankedJournal }) {
  const { why } = r;
  return (
    <div data-testid="why" className="mt-2 rounded-sm border border-line bg-paper-alt p-3 text-xs">
      {why.topics.length > 0 && (
        <div>
          <p className="text-ink-soft">Topics you share with its recent papers</p>
          <ul className="mt-1 space-y-1.5">
            {why.topics.map((t) => (
              <li key={t.id}>
                <p>{t.name}</p>
                <Bar label="your paper" value={t.paperShare} />
                <Bar label="this journal" value={t.journalShare} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {why.cited > 0 && <p className="mt-2">{citedLine(why.cited)}</p>}
      <p className="mt-2 text-ink-soft">
        Closest to its papers {why.centre.label ? <>on <span className="text-ink">{why.centre.label}</span> </> : ""}
        (similarity {why.centre.cos.toFixed(2)}).
      </p>
    </div>
  );
}

// Counts are whole unless a journal's name is shared with another journal, which splits the credit.
function citedLine(cited: number): string {
  if (Number.isInteger(cited)) return `Your reference list cites it ${cited} time${cited === 1 ? "" : "s"}.`;
  return `Your reference list cites a name it shares with another journal (${Math.ceil(cited)} time${Math.ceil(cited) === 1 ? "" : "s"}).`;
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-ink-soft">{label}</span>
      <span className="h-1.5 flex-1 rounded-sm bg-line" aria-hidden>
        <span className="block h-1.5 rounded-sm bg-accent" style={{ width: `${Math.max(2, Math.round(value * 100))}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}
