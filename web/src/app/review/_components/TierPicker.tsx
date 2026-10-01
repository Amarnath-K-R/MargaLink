import type { ReviewTier } from "@/lib/review/reviewTypes";

// The review's tier choices, as the picker shows them.
export const TIER_OPTIONS: { value: ReviewTier; label: string; description: string }[] = [
  { value: "quick", label: "Quick", description: "The 2-3 most significant issues, fast." },
  { value: "standard", label: "Standard", description: "Balanced coverage of the main sections." },
  { value: "thorough", label: "Thorough", description: "Every subsection and table, maximum effort." },
];

export default function TierPicker({ tier, onSelect }: { tier: ReviewTier; onSelect: (tier: ReviewTier) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {TIER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          aria-pressed={tier === opt.value}
          className="clay-card px-4 py-3.5 text-sm"
        >
          <p className="font-serif text-base font-medium">{opt.label}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{opt.description}</p>
        </button>
      ))}
    </div>
  );
}
