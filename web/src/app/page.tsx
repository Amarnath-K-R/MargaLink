"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import { stagger, motionStyle } from "./_home/motion.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import PathwaysSection from "./_home/PathwaysSection.tsx";
import JournalsSection from "./_home/JournalsSection.tsx";
import MatchingSection from "./_home/MatchingSection.tsx";
import ReviewSection from "./_home/ReviewSection.tsx";
import PrivacySection from "./_home/PrivacySection.tsx";
import IntroSequence from "@/components/IntroSequence";
import ThreePaperScene from "@/components/ThreePaperScene";
import "./_home/home.css";

function Home() {
  const {
    progress,
    heroProgress,
    journalsProgress,
    matchingProgress,
    reviewProgress,
    privacyProgress,
    finalProgress,
    reducedMotion,
    heroRef,
    journalsRef,
    matchingRef,
    reviewRef,
    privacyRef,
    finalRef,
  } = useScrollProgress();

  const screenDive = useMemo(() => (reducedMotion ? 0 : between(progress, 0.12, 0.2)), [progress, reducedMotion]);
  const featureEntry = useMemo(() => (reducedMotion ? 1 : between(progress, 0.13, 0.21)), [progress, reducedMotion]);

  return (
    <div className="margalink-page">
      <ThreePaperScene progress={progress} heroProgress={heroProgress} reducedMotion={reducedMotion} />
      <div className="grain" aria-hidden="true" />

      <SiteHeader />

      <main>
        <HeroSection heroRef={heroRef} heroProgress={heroProgress} screenDive={screenDive} />

        <PathwaysSection
          progress={progress}
          reducedMotion={reducedMotion}
          featureEntry={featureEntry}
          journalsProgress={journalsProgress}
        />

        <JournalsSection
          journalsRef={journalsRef}
          journalsProgress={journalsProgress}
          matchingProgress={matchingProgress}
          reducedMotion={reducedMotion}
        />

        <MatchingSection
          matchingRef={matchingRef}
          matchingProgress={matchingProgress}
          reviewProgress={reviewProgress}
          reducedMotion={reducedMotion}
        />

        <ReviewSection
          reviewRef={reviewRef}
          reviewProgress={reviewProgress}
          privacyProgress={privacyProgress}
          reducedMotion={reducedMotion}
        />

        <PrivacySection
          privacyRef={privacyRef}
          privacyProgress={privacyProgress}
          finalProgress={finalProgress}
          reducedMotion={reducedMotion}
        />

        <section ref={finalRef} className="final-section section-shell">
          <div className="final-kicker" style={motionStyle(reducedMotion, stagger(finalProgress, 0, 4, 30))}>
            <span className="eyebrow-line" /> YOUR NEXT MOVE
          </div>
          <h2 style={motionStyle(reducedMotion, stagger(finalProgress, 1, 4, 30))}>
            Make the next submission
            <br />
            <em>feel more considered.</em>
          </h2>
          <p style={motionStyle(reducedMotion, stagger(finalProgress, 2, 4, 30))}>
            Browse first. Match privately. Review only when you choose.
          </p>
          <div className="final-actions" style={motionStyle(reducedMotion, stagger(finalProgress, 3, 4, 30))}>
            <Link href="/journals" className="button button-primary">
              Browse journals <ArrowUpRight size={16} />
            </Link>
            <Link href="/match" className="button button-quiet">
              Match your paper <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="final-footer">
            <span>© 2026 MargaLink</span>
            <span className="mono">CALM TOOLS FOR SERIOUS PAPERS</span>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Back to top <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <IntroSequence>
      <Home />
    </IntroSequence>
  );
}
