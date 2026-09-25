"use client";

import { useMemo, useState } from "react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import ToolsOverlay from "./_home/ToolsOverlay.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import FinalSection from "./_home/FinalSection.tsx";
import IntroSequence from "@/components/IntroSequence";
import ThreePaperScene from "@/components/ThreePaperScene";
import ClayDesk from "@/components/ClayDesk";
import { LANDING_DESK, LANDING_DESK_NARROW } from "@/components/three/clayDesk";
import "./_home/home.css";

function Home() {
  const { progress, heroProgress, finalProgress, reducedMotion, heroRef, finalRef } = useScrollProgress();

  // The landing crossfades into the closing section as it arrives — no empty
  // beat between them — and the stage recedes as it goes.
  const landingFade = between(finalProgress, 0, 0.55);
  const screenDive = useMemo(() => (reducedMotion ? 0 : between(finalProgress, 0.1, 0.8)), [finalProgress, reducedMotion]);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="margalink-page">
      <ThreePaperScene progress={progress} heroProgress={heroProgress} reducedMotion={reducedMotion} />
      <ClayDesk layout={LANDING_DESK} narrowLayout={LANDING_DESK_NARROW} className="landing-desk" style={{ opacity: 1 - landingFade }} active={landingFade < 1} />
      <div className="grain" aria-hidden="true" />

      <SiteHeader onOpenTools={() => setToolsOpen(true)} />
      <ToolsOverlay open={toolsOpen} onClose={() => setToolsOpen(false)} />

      <main>
        <HeroSection heroRef={heroRef} landingFade={landingFade} screenDive={screenDive} />

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
