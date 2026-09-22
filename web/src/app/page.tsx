"use client";

import { useMemo } from "react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import PathwaysSection from "./_home/PathwaysSection.tsx";
import JournalsSection from "./_home/JournalsSection.tsx";
import MatchingSection from "./_home/MatchingSection.tsx";
import ReviewSection from "./_home/ReviewSection.tsx";
import PrivacySection from "./_home/PrivacySection.tsx";
import FinalSection from "./_home/FinalSection.tsx";
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

        <FinalSection finalRef={finalRef} finalProgress={finalProgress} reducedMotion={reducedMotion} />
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
