import type { RefObject } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PrivacyPill } from "./atoms.tsx";

// The first screen says what MargaLink does and offers the main action at
// once: the words arrive in one short entrance on load (CSS, skipped under
// reduced motion), not word by word over two screens of scrolling. Scrolling
// on lets the stage recede (`screenDive`) while the paper turns beside it.
export default function HeroSection({
  heroRef,
  screenDive,
  reducedMotion,
}: {
  heroRef: RefObject<HTMLElement | null>;
  screenDive: number;
  reducedMotion: boolean;
}) {
  return (
    <section id="hero" ref={heroRef} className="hero section-shell">
      <div
        className="hero-stage"
        style={
          reducedMotion
            ? undefined
            : {
                transform: `translateY(${screenDive * -60}px) scale(${1 - screenDive * 0.04})`,
                opacity: 1 - screenDive,
              }
        }
      >
        <div className="hero-copy">
          <p className="eyebrow hero-in" style={{ animationDelay: "0ms" }}>
            <span className="eyebrow-line" /> For researchers getting a paper out the door
          </p>
          <h1 className="hero-title">
            <span className="hero-in" style={{ animationDelay: "80ms" }}>
              Keep the paper.
            </span>
            <em className="hero-in" style={{ animationDelay: "200ms" }}>
              Lose the guesswork.
            </em>
          </h1>
          <p className="hero-deck hero-in" style={{ animationDelay: "320ms" }}>
            Find journals that fit, check your manuscript against their rules, write it in their LaTeX template and
            make its figures — all in your browser, without uploading the paper.
          </p>
          <div className="hero-actions hero-in" style={{ animationDelay: "420ms" }}>
            <Link href="/match" className="button button-primary">
              Match your paper <ArrowRight size={16} />
            </Link>
            <Link href="/journals" className="text-link">
              Browse journals
            </Link>
          </div>
          <div className="hero-proof hero-in" style={{ animationDelay: "520ms" }}>
            <PrivacyPill>Your paper stays in this tab</PrivacyPill>
            <span className="hero-proof-note">Two opt-in features send anything out, and only after you agree.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
