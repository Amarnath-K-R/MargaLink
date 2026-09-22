"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import ThreeIntroScene from "@/components/ThreeIntroScene";

type IntroSequenceProps = { children: ReactNode };

const SEEN_KEY = "margalink-intro-seen";

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

  const questionOpacity = progress < 0.4 ? 1 : Math.max(0, 1 - (progress - 0.4) / 0.14);
  const wordmarkOpacity = Math.min(1, Math.max(0, (progress - 0.5) / 0.18));

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
        const pause = reduced ? 0 : mobile ? 420 : 650;
        const fade = reduced ? 80 : mobile ? 650 : 900;
        window.setTimeout(() => setFading(true), pause);
        window.setTimeout(() => setDismissed(true), pause + fade);
      },
      reduced ? 450 : 8000,
    );
    return () => window.clearTimeout(timer);
  }, [alreadySeen]);

  return (
    <>
      {children}
      {!dismissed && (
        <div className={`intro-overlay${fading ? " intro-fade" : ""}`} aria-hidden={fading}>
          <ThreeIntroScene onProgress={setProgress} />
          <div className="intro-vignette" />
          <div className="intro-question" style={{ opacity: questionOpacity }}>
            <span className="question-kicker">THE FIRST QUESTION</span>
            <strong>
              Struggling with
              <br />
              <mark>paper publication?</mark>
            </strong>
          </div>
          <div className="intro-wordmark" style={{ opacity: fading ? 0 : wordmarkOpacity }}>
            <span className="intro-mark">M</span>
            <span className="intro-name">
              <span>Marga</span>
              <em>Link</em>
            </span>
          </div>
          <div className="intro-caption" style={{ opacity: Math.min(1, Math.max(0, (progress - 0.63) * 3.2)) }}>
            A quieter way to publish
          </div>
          <div className="intro-status mono" style={{ opacity: fading ? 0 : 0.8 }}>
            <span className="intro-status-dot" /> PAPER / PRIVACY / PURPOSE
          </div>
          <div className="intro-progress-track">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>
      )}
    </>
  );
}
