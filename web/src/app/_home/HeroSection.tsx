import type { RefObject } from "react";
import { ChevronDown } from "lucide-react";

// The landing. Scrolling on, it fades and the stage recedes (`screenDive`,
// 0 under reduced motion — see page.tsx) into the closing section.
export default function HeroSection({
  heroRef,
  landingFade,
  screenDive,
}: {
  heroRef: RefObject<HTMLElement | null>;
  landingFade: number;
  screenDive: number;
}) {
  return (
    <section id="hero" ref={heroRef} className="hero section-shell">
      <div
        className="hero-stage"
        style={{
          transform: `perspective(1200px) translateY(${screenDive * -120}px) scale(${1 + screenDive * 1.25}) rotateX(${screenDive * 3}deg)`,
          filter: `blur(${screenDive * 5}px)`,
          opacity: 1 - screenDive * 0.84,
        }}
      >
        <div
          className="hero-brand-landing"
          style={{
            opacity: 1 - landingFade,
            transform: `translate(-50%, calc(-50% + ${landingFade * -22}px))`,
          }}
        >
          {/* The landing: the wordmark with "Link" in the intro's teal cutout,
              the catchphrase (Marga is Sanskrit for path), and the way in.
              The clay desk behind it is page-level (page.tsx). */}
          <h1 className="landing-wordmark landing-in" style={{ animationDelay: "100ms" }}>
            Marga<mark className="landing-cut">Link</mark>
          </h1>
          <p className="landing-catch landing-in" style={{ animationDelay: "280ms" }}>
            Find your <em>path.</em>
          </p>
          <p className="landing-kicker landing-in" style={{ animationDelay: "380ms" }}>
            <span /> Marga is Sanskrit for “path” <span />
          </p>
          <p className="landing-deck landing-in" style={{ animationDelay: "480ms" }}>
            Find the journals that fit your paper, check it against their rules, write it in their template — without
            your manuscript ever leaving the browser.
          </p>
        </div>
        <div className="scroll-hint">
          <span>SCROLL TO TRACE THE REVEAL</span>
          <ChevronDown size={16} />
        </div>
      </div>
    </section>
  );
}
