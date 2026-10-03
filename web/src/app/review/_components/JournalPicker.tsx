import Link from "next/link";
import { JOURNAL_RULES } from "@/lib/journals/journalRules";

// The pilot journals as clay cards. The caller supplies the heading.
// `showMatchLink` false inside the writing workspace, where leaving for
// /match would close the project (its Match window is a click away instead).
export default function JournalPicker({
  selectedJournalId,
  onSelect,
  showMatchLink = true,
}: {
  selectedJournalId: string | null;
  onSelect: (journalId: string) => void;
  showMatchLink?: boolean;
}) {
  return (
    <div>
      <p className="mb-5 text-sm text-ink-soft">
        Only journals with hand-verified guidelines are listed here
        {showMatchLink ? (
          <>
            ; see{" "}
            <Link href="/match" className="text-accent hover:underline">
              match your paper
            </Link>{" "}
            instead if you want ranked suggestions across the full index.
          </>
        ) : (
          "."
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {JOURNAL_RULES.map((j) => (
          <button
            key={j.journalId}
            type="button"
            onClick={() => onSelect(j.journalId)}
            aria-pressed={selectedJournalId === j.journalId}
            className="clay-card px-5 py-4"
          >
            <p className="font-serif text-[1.05rem] font-medium">{j.journalName}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{j.scopeSummary}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
