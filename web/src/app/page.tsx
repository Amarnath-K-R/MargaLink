"use client";

import { useEffect, useMemo, useState } from "react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import ToolsOverlay from "./_home/ToolsOverlay.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import FinalSection from "./_home/FinalSection.tsx";
import IntroSequence from "@/components/IntroSequence";
import ClayDesk from "@/components/ClayDesk";
import { LANDING_DESK, LANDING_DESK_NARROW } from "@/components/three/clayDesk";
import "./_home/home.css";

function Home() {
  const { progress, finalProgress, reducedMotion, heroRef, finalRef } = useScrollProgress();

  // The landing's words crossfade into the closing section as it arrives; the
  // desk morphs over the same scroll — objects leave, the paper stack comes
  // forward to the right — and the 3D hands over to the typed paper
  // (FinalSection) at the end.
  const landingFade = between(finalProgress, 0, 0.55);
  const morph = between(progress, 0.03, 0.82);
  // Phones have no room beside the text: the desk just fades with the landing.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 759px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a media query needs window
    setNarrow(mq.matches);
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // Wider screens: the desk stays — its paper settles beside the copy and
  // writes itself. Phones: the desk fades and an HTML page writes instead.
  const deskOut = narrow ? landingFade : 0;
  const paperShown = narrow ? between(finalProgress, 0.5, 1) : 0;
  const [writePaper, setWritePaper] = useState(false);
  if (!writePaper && paperShown > 0.6) setWritePaper(true);
  const screenDive = useMemo(() => (reducedMotion ? 0 : between(finalProgress, 0.1, 0.8)), [finalProgress, reducedMotion]);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="margalink-page">
      <ClayDesk layout={LANDING_DESK} narrowLayout={LANDING_DESK_NARROW} className="landing-desk" style={{ opacity: 1 - deskOut }} active={deskOut < 1} morph={morph} />
      <div className="grain" aria-hidden="true" />

      <SiteHeader onOpenTools={() => setToolsOpen(true)} />
      <ToolsOverlay open={toolsOpen} onClose={() => setToolsOpen(false)} />

      <main>
        <HeroSection heroRef={heroRef} landingFade={landingFade} screenDive={screenDive} />

        <FinalSection finalRef={finalRef} finalProgress={finalProgress} onOpenTools={() => setToolsOpen(true)} writePaper={writePaper} paperShown={paperShown} reducedMotion={reducedMotion} />
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
