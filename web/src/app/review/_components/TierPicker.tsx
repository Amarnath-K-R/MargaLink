import type { ReviewTier } from "@/lib/reviewTypes";

// Review-picker labels, a different audience than the homepage's
// reviewTiersData (_home/demoData.ts) — one describes a real choice being
// made here, the other is marketing copy. They'll legitimately drift;
// that's not a bug to fix.
export const TIER_OPTIONS: { value: ReviewTier; label: string; description: string }[] = [
  { value: "quick", label: "Quick", description: "The 2-3 most significant issues, fast." },
  { value: "standard", label: "Standard", description: "Balanced coverage of the main sections." },
  { value: "thorough", label: "Thorough", description: "Every subsection and table, maximum effort." },
];

export default function TierPicker({ tier, onSelect }: { tier: ReviewTier; onSelect: (tier: ReviewTier) => void }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {TIER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          aria-pressed={tier === opt.value}
          className={`rounded-sm border p-3 text-left text-sm transition-colors ${
            tier === opt.value ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"
          }`}
        >
          <p className="font-medium">{opt.label}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{opt.description}</p>
        </button>
      ))}
    </div>
  );
}
