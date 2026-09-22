import type { JournalFilters } from "@/lib/match";

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
    <div className="flex flex-wrap items-end gap-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Field</span>
        <select
          value={filters.field ?? ""}
          onChange={(e) => onChange({ ...filters, field: e.target.value || undefined })}
          className="rounded-sm border border-line bg-paper px-2 py-1.5"
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
        <span className="text-ink-soft">Fee</span>
        <select
          value={filters.maxFeeUsd === undefined ? "" : String(filters.maxFeeUsd)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...filters, maxFeeUsd: v === "" ? undefined : Number(v) });
          }}
          className="rounded-sm border border-line bg-paper px-2 py-1.5"
        >
          {FEE_PRESETS.map((p) => (
            <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-soft">Speed</span>
        <select
          value={filters.maxPublicationWeeks === undefined ? "" : String(filters.maxPublicationWeeks)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...filters, maxPublicationWeeks: v === "" ? undefined : Number(v) });
          }}
          className="rounded-sm border border-line bg-paper px-2 py-1.5"
        >
          {SPEED_PRESETS.map((p) => (
            <option key={p.label} value={p.value === undefined ? "" : String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1.5">
        <input
          type="checkbox"
          checked={filters.openAccessOnly ?? false}
          onChange={(e) => onChange({ ...filters, openAccessOnly: e.target.checked })}
        />
        <span>Open access (DOAJ) only</span>
      </label>
      <label className="flex items-center gap-2 pb-1.5">
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
