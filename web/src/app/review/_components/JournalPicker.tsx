import Link from "next/link";
import { JOURNAL_RULES } from "@/lib/journalRules";

export default function JournalPicker({
  selectedJournalId,
  onSelect,
}: {
  selectedJournalId: string | null;
  onSelect: (journalId: string) => void;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <p className="mb-3 text-sm font-medium text-accent">2. Choose a journal</p>
      <p className="mb-4 text-sm text-ink-soft">
        Only journals with hand-verified guidelines are listed here — see{" "}
        <Link href="/match" className="text-accent hover:underline">
          match your paper
        </Link>{" "}
        instead if you want ranked suggestions across the full index.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {JOURNAL_RULES.map((j) => (
          <button
            key={j.journalId}
            type="button"
            onClick={() => onSelect(j.journalId)}
            aria-pressed={selectedJournalId === j.journalId}
            className={`rounded-sm border p-4 text-left transition-colors ${
              selectedJournalId === j.journalId
                ? "border-accent bg-accent-soft"
                : "border-line bg-paper-alt hover:border-accent"
            }`}
          >
            <p className="font-serif font-medium">{j.journalName}</p>
            <p className="mt-1 text-xs text-ink-soft">{j.scopeSummary}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
