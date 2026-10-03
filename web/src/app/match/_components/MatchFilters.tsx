import type { JournalFilters } from "@/lib/match/match";

const FEE_PRESETS = [
  { label: "Any fee", value: undefined },
  { label: "Free only", value: 0 },
  { label: "Under $1,500", value: 1500 },
  { label: "Under $3,000", value: 3000 },
  { label: "Under $5,000", value: 5000 },
] as const;

const SPEED_PRESETS = [
  { label: "Any speed", value: undefined },
  { label: "Under 8 weeks", value: 8 },
  { label: "Under 16 weeks", value: 16 },
  { label: "Under 26 weeks", value: 26 },
] as const;

export default function MatchFilters({
  filters,
  availableFields,
  onChange,
}: {
  filters: JournalFilters;
  availableFields: string[];
  onChange: (next: JournalFilters) => void;
}) {
  return (
    <div className="clay flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="pl-1 text-xs text-ink-soft">Field</span>
        <select
          value={filters.field ?? ""}
          onChange={(e) => onChange({ ...filters, field: e.target.value || undefined })}
          className="clay-btn clay-select w-52 truncate text-sm"
        >
          <option value="">All fields</option>
          {availableFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="pl-1 text-xs text-ink-soft">Fee</span>
        <select
          value={filters.maxFeeUsd === undefined ? "" : String(filters.maxFeeUsd)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...filters, maxFeeUsd: v === "" ? undefined : Number(v) });
          }}
          className="clay-btn clay-select text-sm"
        >
          {FEE_PRESETS.map((p) => (
            <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="pl-1 text-xs text-ink-soft">Speed</span>
        <select
          value={filters.maxPublicationWeeks === undefined ? "" : String(filters.maxPublicationWeeks)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...filters, maxPublicationWeeks: v === "" ? undefined : Number(v) });
          }}
          className="clay-btn clay-select text-sm"
        >
          {SPEED_PRESETS.map((p) => (
            <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-[2.125rem] cursor-pointer items-center gap-2 rounded-full px-3 hover:bg-white/60 has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
        <input
          type="checkbox"
          checked={filters.openAccessOnly ?? false}
          onChange={(e) => onChange({ ...filters, openAccessOnly: e.target.checked })}
        />
        <span>Open access (DOAJ) only</span>
      </label>
      <label className="flex h-[2.125rem] cursor-pointer items-center gap-2 rounded-full px-3 hover:bg-white/60 has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
        <input
          type="checkbox"
          checked={filters.medlineOnly ?? false}
          onChange={(e) => onChange({ ...filters, medlineOnly: e.target.checked })}
        />
        <span>MEDLINE-indexed only</span>
      </label>
    </div>
  );
}
