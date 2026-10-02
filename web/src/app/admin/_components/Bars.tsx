// Thirty days as bars, one per day (hover for the figure). Inline SVG: no
// chart library for one bar chart.
export default function Bars({ days, values, label, format }: { days: string[]; values: number[]; label: string; format: (n: number) => string }) {
  const top = Math.max(0, ...values);
  const max = top || 1; // all zero: flat bars, not a division by zero
  const step = 600 / values.length;
  return (
    <figure>
      <svg role="img" aria-label={label} viewBox="0 0 600 112" className="h-auto w-full">
        {values.map((v, i) => {
          const h = (v / max) * 104;
          return (
            <rect key={days[i]} data-day={days[i]} x={i * step + step * 0.18} width={step * 0.64} y={110 - h} height={Math.max(h, v ? 2 : 0)} rx={3} fill="var(--accent)" opacity={i === values.length - 1 ? 1 : 0.7}>
              <title>{`${days[i]}: ${format(v)}`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={600} y1={110.5} y2={110.5} stroke="var(--line)" />
      </svg>
      <div aria-hidden className="mt-1 flex justify-between text-xs text-ink-soft tabular-nums">
        <span>{days[0]}</span>
        <span>Today</span>
      </div>
      <figcaption className="mt-2 text-sm text-ink-soft">
        {label}. Highest: {format(top)}.
      </figcaption>
    </figure>
  );
}
