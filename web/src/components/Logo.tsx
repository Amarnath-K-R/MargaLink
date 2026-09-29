// The MargaLink logo: a bold M drawn as one route, ending at a dot (teal
// line, ochre dot), and the wordmark, whose "i" carries the same ochre dot.
// "light" is for dark or teal backgrounds. `small` thickens the line for
// sizes around 20px and under, where the regular weight goes faint.

const COLORS = {
  color: { line: "var(--accent)", dot: "var(--spark)" },
  light: { line: "#fbfaf6", dot: "#e3b866" },
} as const;

export function LogoMark({ className, tone = "color", small = false }: { className?: string; tone?: keyof typeof COLORS; small?: boolean }) {
  const c = COLORS[tone];
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <path
        d={small ? "M22 78 V32 Q22 20 31 28 L50 50 L69 28 Q78 20 78 32 V62" : "M22 78 V32 Q22 20 31 28 L50 50 L69 28 Q78 20 78 32 V64"}
        fill="none"
        stroke={c.line}
        strokeWidth={small ? 18 : 16}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="78" cy={small ? 87 : 86} r={small ? 10 : 9} fill={c.dot} />
    </svg>
  );
}

// The "i" is a dotless ı with the ochre dot laid where IBM Plex Sans
// SemiBold draws its own (measured against the real glyph), so this only
// lines up in that face and weight. Screen readers get the plain name.
export function Wordmark({ className = "", tone = "color" }: { className?: string; tone?: keyof typeof COLORS }) {
  return (
    <span className={`font-sans font-semibold tracking-[-0.02em] ${className}`}>
      {/* select-none: a copy gives the plain name (the sr-only span), not "MargaLınk". */}
      <span aria-hidden="true" className={`select-none ${tone === "light" ? "text-[#fbfaf6]" : ""}`}>
        Marga
        <span className={tone === "light" ? "text-[#8fc0cc]" : "text-accent"}>
          L
          <span className="relative">
            ı
            <span className="absolute left-1/2 top-[0.28em] h-[0.15em] w-[0.15em] -translate-x-1/2 rounded-full" style={{ background: COLORS[tone].dot }} />
          </span>
          nk
        </span>
      </span>
      <span className="sr-only">MargaLink</span>
    </span>
  );
}
