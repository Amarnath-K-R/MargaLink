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
    <div className="flex justify-between border-t border-line py-2.5 text-sm first:border-t-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={detected ? "text-accent" : ""}>{value}</dd>
    </div>
  );
}
