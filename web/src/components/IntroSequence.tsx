"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

type IntroSequenceProps = { children: ReactNode };

const SEEN_KEY = "margalink-intro-seen";
// The intro is a transparent layer over the homepage's own landing: the clay
// desk floats (ClayDesk holds it while .intro-overlay is on the page and not
// fading), the question shows, then the landing's real wordmark builds
// (.intro-overlay[data-wordmark]) and, as the intro ends, the desk settles and
// the rest of the landing slides in — the intro's last frame is the landing's
// first. Keyed on the overlay, not a body class, because the overlay is in the
// server-rendered HTML from the first paint; a class added after hydration
// would let the landing run before the intro had begun.
export const INTRO_MS = 5000;
const WORDMARK_AT = 0.5; // fraction of INTRO_MS

export default function IntroSequence({ children }: IntroSequenceProps) {
  // Lazy initializer: runs once at mount, not re-read on every render. The
  // effect below flips this flag in sessionStorage as its first action, so
  // re-deriving it from sessionStorage on every render would make it change
  // on the very next re-render (the intro's own progress animation re-renders
  // constantly) and tear down the dismiss timer before it ever fires.
  const [alreadySeen] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(SEEN_KEY) === "1",
  );
  const [fading, setFading] = useState(false);
  // Always starts false, matching what a server render (no `window`) would
  // produce — starting from `alreadySeen` here caused a real bug: on a hard
  // navigation (not client-side routing) where sessionStorage already has
  // the flag, the server-rendered HTML always has the overlay (server has no
  // `window`), and hydrating straight into `dismissed=true` left React
  // unable to reconcile the mismatch, so the overlay stayed stuck on screen
  // instead of being torn down. `useLayoutEffect` below corrects it
  // synchronously after hydration, before the browser paints — no flash.
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState(0);

  useLayoutEffect(() => {
    // Reading sessionStorage requires `window`, so this can only run after
    // mount — a real "sync with an external system" case (correcting for
    // what the server couldn't know), not derivable state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (alreadySeen) setDismissed(true);
  }, [alreadySeen]);

  const questionOpacity = progress < 0.36 ? 1 : Math.max(0, 1 - (progress - 0.36) / 0.12);

  // The intro's clock: drives the question, the progress line and the moment
  // the landing's wordmark starts to build.
  useEffect(() => {
    if (alreadySeen) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / INTRO_MS);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [alreadySeen]);

  useEffect(() => {
    document.body.classList.toggle("intro-bridge-pending", !fading && !dismissed);
    document.body.classList.toggle("intro-bridge-fading", fading && !dismissed);
    if (dismissed) {
      document.body.classList.remove("intro-bridge-pending", "intro-bridge-fading");
    }
    return () => document.body.classList.remove("intro-bridge-pending", "intro-bridge-fading");
  }, [fading, dismissed]);

  useEffect(() => {
    if (alreadySeen) return;
    window.sessionStorage.setItem(SEEN_KEY, "1");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => {
        const mobile = window.matchMedia("(max-width: 680px)").matches;
        const pause = reduced ? 0 : mobile ? 150 : 200;
        const fade = reduced ? 80 : 600;
        window.setTimeout(() => setFading(true), pause);
        window.setTimeout(() => setDismissed(true), pause + fade);
      },
      reduced ? 450 : INTRO_MS,
    );
    return () => window.clearTimeout(timer);
  }, [alreadySeen]);

  return (
    <>
      {children}
      {!dismissed && (
        <div className={`intro-overlay${fading ? " intro-fade" : ""}`} aria-hidden={fading} data-wordmark={progress >= WORDMARK_AT ? "" : undefined}>
          <div className="intro-vignette" />
          <div className="intro-question" style={{ opacity: questionOpacity }}>
            <span className="question-kicker">The first question</span>
            <strong>
              Struggling with
              <br />
              <mark>paper publication?</mark>
            </strong>
          </div>
          <div className="intro-status mono" style={{ opacity: fading ? 0 : 0.8 }}>
            <span className="intro-status-dot" /> Paper / privacy / purpose
          </div>
          <div className="intro-progress-track">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>
      )}
    </>
  );
}
