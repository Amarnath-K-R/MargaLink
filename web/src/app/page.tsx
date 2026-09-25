"use client";

import { useState } from "react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import ToolsOverlay from "./_home/ToolsOverlay.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import PathwaysSection from "./_home/PathwaysSection.tsx";
import JournalsSection from "./_home/JournalsSection.tsx";
import MatchingSection from "./_home/MatchingSection.tsx";
import ReviewSection from "./_home/ReviewSection.tsx";
import WritingSection from "./_home/WritingSection.tsx";
import PrivacySection from "./_home/PrivacySection.tsx";
import FinalSection from "./_home/FinalSection.tsx";
import SiteFooter from "./_home/SiteFooter.tsx";
import IntroSequence from "@/components/IntroSequence";
import ThreePaperScene from "@/components/ThreePaperScene";
import "./_home/home.css";

function Home() {
  const { heroProgress, sections, scrolled, reducedMotion, heroRef, sectionRef } = useScrollProgress();
  // The hero recedes as the workflow list arrives — both from section-local
  // progress, so page length never shifts the choreography.
  const screenDive = reducedMotion ? 0 : between(heroProgress, 0.55, 1);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="margalink-page">
      <ThreePaperScene heroProgress={heroProgress} sections={sections} reducedMotion={reducedMotion} />
      <div className="grain" aria-hidden="true" />

      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader scrolled={scrolled} onOpenTools={() => setToolsOpen(true)} />
      <ToolsOverlay open={toolsOpen} onClose={() => setToolsOpen(false)} />

      <main id="main">
        <HeroSection heroRef={heroRef} screenDive={screenDive} reducedMotion={reducedMotion} />
        <PathwaysSection sectionRef={sectionRef("pathways")} progress={sections.pathways} next={sections.journals} reducedMotion={reducedMotion} />
        <JournalsSection sectionRef={sectionRef("journals")} progress={sections.journals} next={sections.matching} reducedMotion={reducedMotion} />
        <MatchingSection sectionRef={sectionRef("matching")} progress={sections.matching} next={sections.review} reducedMotion={reducedMotion} />
        <ReviewSection sectionRef={sectionRef("review")} progress={sections.review} next={sections.writing} reducedMotion={reducedMotion} />
        <WritingSection sectionRef={sectionRef("writing")} progress={sections.writing} next={sections.privacy} reducedMotion={reducedMotion} />
        <PrivacySection sectionRef={sectionRef("privacy")} progress={sections.privacy} next={sections.final} reducedMotion={reducedMotion} />
        <FinalSection sectionRef={sectionRef("final")} progress={sections.final} reducedMotion={reducedMotion} />
      </main>
      <SiteFooter />
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
