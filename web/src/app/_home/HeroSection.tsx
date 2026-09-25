import type { RefObject } from "react";
import { ArrowDown, ArrowUpRight, ChevronDown } from "lucide-react";
import { between } from "@/lib/easing";
import { PrivacyPill, scrollToId } from "./atoms.tsx";

// Note: the hero-word reveals below use raw between(heroProgress, ...)
// directly, not wrapped in motionStyle() — reduced motion is handled
// upstream instead, by screenDive collapsing to 0 (see page.tsx), which
// neutralizes the hero-stage transform/blur/opacity. Preserved exactly as
// it was before this split, not "fixed" here.
export default function HeroSection({
  heroRef,
  heroProgress,
  screenDive,
}: {
  heroRef: RefObject<HTMLElement | null>;
  heroProgress: number;
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
            opacity: 1 - between(heroProgress, 0.02, 0.18),
            transform: `translate(-50%, calc(-50% + ${between(heroProgress, 0.02, 0.18) * -22}px))`,
          }}
        >
          <span className="hero-brand-highlight">
            <span className="hero-brand-mark">M</span>
            <span>
              Marga<em>Link</em>
            </span>
          </span>
          <span className="hero-brand-prompt">
            Scroll to open the paper <ChevronDown size={15} />
          </span>
        </div>
        <div className="hero-copy nonlinear-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> A quieter way to publish
          </div>
          <div
            className="hero-word hero-word-keep"
            style={{
              opacity: between(heroProgress, 0.04, 0.16),
              transform: `translate3d(${(1 - between(heroProgress, 0.04, 0.16)) * -36}px, ${(1 - between(heroProgress, 0.04, 0.16)) * 28}px, 0) scale(${0.94 + between(heroProgress, 0.04, 0.16) * 0.06})`,
            }}
          >
            Keep
          </div>
          <div
            className="hero-word hero-word-paper"
            style={{
              opacity: between(heroProgress, 0.16, 0.3),
              transform: `translate3d(${(1 - between(heroProgress, 0.16, 0.3)) * 52}px, ${(1 - between(heroProgress, 0.16, 0.3)) * 22}px, 0) rotate(${(1 - between(heroProgress, 0.16, 0.3)) * -3}deg)`,
            }}
          >
            the paper.
          </div>
          <div
            className="hero-word hero-word-lose"
            style={{
              opacity: between(heroProgress, 0.48, 0.64),
              transform: `translate3d(${(1 - between(heroProgress, 0.48, 0.64)) * -20}px, ${(1 - between(heroProgress, 0.48, 0.64)) * 20}px, 0)`,
            }}
          >
            Lose the
          </div>
          <div
            className="hero-word hero-word-guess"
            style={{
              opacity: between(heroProgress, 0.63, 0.79),
              transform: `translate3d(${(1 - between(heroProgress, 0.63, 0.79)) * 34}px, ${(1 - between(heroProgress, 0.63, 0.79)) * 28}px, 0) scale(${0.92 + between(heroProgress, 0.63, 0.79) * 0.08})`,
            }}
          >
            guesswork.
          </div>
          <div
            className="hero-support"
            style={{
              opacity: between(heroProgress, 0.77, 0.9),
              transform: `translateY(${(1 - between(heroProgress, 0.77, 0.9)) * 22}px)`,
            }}
          >
            <p className="hero-deck">
              MargaLink helps researchers find the right journal, check the fit, and ask for a review.
            </p>
            <div className="hero-privacy-line">
              <span /> WITHOUT TREATING YOUR PAPER AS SERVER-SIDE DATA.
            </div>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => scrollToId("pathways")}>
                See how it works <ArrowDown size={16} />
              </button>
              <button className="text-link" onClick={() => scrollToId("privacy")}>
                Read the privacy promise <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="hero-proof">
              <PrivacyPill>Paper text stays in the tab</PrivacyPill>
              <span className="hero-proof-note">One clear exception. Always opt-in.</span>
            </div>
          </div>
        </div>
        <div className="hero-coordinate mono">
          37°46′N / 122°25′W
          <br />
          <span>LOCAL / INDEXED / HUMAN</span>
        </div>
        <div className="scroll-hint">
          <span>SCROLL TO TRACE THE REVEAL</span>
          <ChevronDown size={16} />
        </div>
      </div>
    </section>
  );
}
