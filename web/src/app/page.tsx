"use client";

import { useEffect, useState } from "react";
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

// Short beats in the scroll between the landing and the closing section.
const GAP_BEATS = [
  {
    kicker: "Browse journals",
    lead: "Find where it",
    cut: "fits.",
    text: "Browse journals by field, fees, open access and indexing — no upload needed.",
    tags: ["Field & topics", "APC fees", "Open access", "Indexed in", "Review speed"],
  },
  {
    kicker: "Match your paper",
    lead: "Match without",
    cut: "uploading.",
    text: "Your paper is read and ranked against every journal inside this tab.",
    steps: ["Reads your title, abstract and references", "Ranks thousands of journals on this device", "Shows why each one fits"],
  },
];

function Home() {
  const { finalProgress, reducedMotion, heroRef, finalRef } = useScrollProgress();

  // Wider screens: the desk scrolls with the page (its camera pans down it);
  // after the landing, a gap where only the path winds on, then the closing
  // section's paper stands up and a pin drops onto it (clayDesk.ts).
  // Phones: the landing fades into the closing section instead.
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
  const landingFade = narrow ? between(finalProgress, 0, 0.55) : 0;
  const deskOut = narrow ? landingFade : 0;
  const paperShown = narrow ? between(finalProgress, 0.5, 1) : 0;
  const [writePaper, setWritePaper] = useState(false);
  if (!writePaper && paperShown > 0.6) setWritePaper(true);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="margalink-page">
      <ClayDesk layout={LANDING_DESK} narrowLayout={LANDING_DESK_NARROW} className="landing-desk" style={{ opacity: 1 - deskOut }} active={deskOut < 1} />
      <div className="grain" aria-hidden="true" />

      <SiteHeader onOpenTools={() => setToolsOpen(true)} />
      <ToolsOverlay open={toolsOpen} onClose={() => setToolsOpen(false)} />

      <main>
        <HeroSection heroRef={heroRef} landingFade={landingFade} screenDive={narrow && !reducedMotion ? between(finalProgress, 0.1, 0.8) : 0} />
        {/* the path winds on down the desk before the next section, past a few words on what's here */}
        <div className="path-gap section-shell">
          {GAP_BEATS.map((b, i) => (
            <div key={b.cut} className={`gap-beat ${i % 2 ? "" : "gap-beat-right"}`}>
              <span className="gap-kicker">
                <span className="gap-step">{String(i + 1).padStart(2, "0")}</span> {b.kicker}
              </span>
              <h2>
                {b.lead} <mark className="gap-cut">{b.cut}</mark>
              </h2>
              <p>{b.text}</p>
              {"tags" in b && b.tags && (
                <ul className="gap-tags">
                  {b.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              {"steps" in b && b.steps && (
                <ol className="gap-steps">
                  {b.steps.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>

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
