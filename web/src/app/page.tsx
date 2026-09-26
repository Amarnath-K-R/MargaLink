"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import SiteHeader from "./_home/SiteHeader.tsx";
import ToolsOverlay from "./_home/ToolsOverlay.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import FinalSection from "./_home/FinalSection.tsx";
import IntroSequence from "@/components/IntroSequence";
import ClayDesk from "@/components/ClayDesk";
import { LANDING_DESK, LANDING_DESK_NARROW } from "@/components/three/clayDesk";
import { SPREADS, spreadAt } from "@/components/three/bookSpreads";
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
  const { finalProgress, bookProgress, reducedMotion, heroRef, finalRef, bookRef } = useScrollProgress();
  const spread = SPREADS[spreadAt(bookProgress)];

  // Wider screens: the desk scrolls with the page (its camera pans down it);
  // after the landing, a gap where only the path winds on, then the closing
  // section's paper stands up and a pin drops onto it, then the path runs on
  // to the tools book, which holds while its pages turn (clayDesk.ts).
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

        {/* the closing view holds while the desk's paper writes itself (clayDesk.ts) */}
        <div id="closing" className="closing-hold">
          <FinalSection finalRef={finalRef} finalProgress={finalProgress} onOpenTools={() => setToolsOpen(true)} writePaper={writePaper} paperShown={paperShown} reducedMotion={reducedMotion} />
        </div>

        {/* the open book on the desk: scroll holds the view and turns its pages,
            one tool per spread (clayDesk.ts, book.ts); phones get the cards */}
        <section id="tools-book" ref={bookRef} className="book-section" aria-labelledby="book-title">
          <h2 id="book-title" className="sr-only">
            Three more tools
          </h2>
          <div className="book-sticky">
            <p key={spread.n} className="book-caption">
              <span className="gap-step">{spread.n}</span>
              <strong>{spread.tool}</strong>
              <span className="book-caption-line">{spread.line}</span>
              <Link href={spread.href} className="book-caption-link">
                Open {spread.tool} <ArrowUpRight size={15} />
              </Link>
            </p>
          </div>
          <ol className="book-cards section-shell">
            {SPREADS.map((s) => (
              <li key={s.n} className="book-card">
                <span className="gap-kicker">
                  <span className="gap-step">{s.n}</span> {s.tool}
                </span>
                <h3>
                  {s.lead} <mark className="gap-cut">{s.cut}</mark>
                </h3>
                <p>{s.line}</p>
                <Link href={s.href} className="landing-link">
                  Open {s.tool} <ArrowUpRight size={15} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <footer className="final-footer section-shell">
          <span>© 2026 MargaLink</span>
          <span className="mono">CALM TOOLS FOR SERIOUS PAPERS</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Back to top <ArrowUpRight size={14} />
          </button>
        </footer>
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
