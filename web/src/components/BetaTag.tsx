// "Beta" beside the MargaLink wordmark in both headers (the tool tray and
// the landing page), while the core team tests it.
export default function BetaTag() {
  return (
    <span
      title="MargaLink is in beta: things may change, and we'd love to hear what breaks."
      className="rounded-full border border-[#e2cf9f] bg-[#f3e4bd] px-1.5 py-px font-sans text-[10px] font-medium leading-4 tracking-normal text-[#6b5424]"
    >
      Beta
    </span>
  );
}
