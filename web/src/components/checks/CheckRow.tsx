import { Check, Minus } from "lucide-react";

// One line of a check: the label, then the value — with a teal tick when it
// was found or is within limits, a quiet dash when it wasn't, and no mark
// when the row is just a count.
export default function CheckRow({
  label,
  value,
  detected,
}: {
  label: string;
  value: string;
  detected?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line/70 py-2.5 text-sm first:border-t-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`flex items-center gap-2 text-right ${detected ? "text-accent" : detected === false ? "text-ink-soft" : ""}`}>
        {value}
        {detected === true && (
          <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-accent text-white">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
        {detected === false && (
          <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-[#e3dfd5] text-ink-soft">
            <Minus size={10} strokeWidth={3} />
          </span>
        )}
      </dd>
    </div>
  );
}
