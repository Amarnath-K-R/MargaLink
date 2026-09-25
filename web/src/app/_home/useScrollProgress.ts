"use client";

import { useEffect, useRef, useState } from "react";
import { localProgress } from "./motion.ts";

// Drives every scroll-linked value on the homepage: overall page progress,
// hero-specific progress (the hero section is taller than the viewport, so
// it needs its own local measure), the closing section's local progress
// (localProgress — 0 until it scrolls into view, 1 once it's mostly
// arrived), and the reduced-motion preference. One rAF-throttled scroll
// listener drives all of it, rather than a listener per section.
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [heroProgress, setHeroProgress] = useState(0);
  const [finalProgress, setFinalProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const finalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Reading a media query requires `window`, so this can only happen after
    // mount — a real "sync with an external system" case, not derivable state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewportHeight = window.innerHeight;
        const maxScroll = document.documentElement.scrollHeight - viewportHeight;
        setProgress(maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0);

        const hero = heroRef.current;
        if (hero) {
          const travel = Math.max(hero.offsetHeight - viewportHeight, 1);
          setHeroProgress(Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / travel)));
        }

        if (finalRef.current) setFinalProgress(localProgress(finalRef.current.getBoundingClientRect(), viewportHeight));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return {
    progress,
    heroProgress,
    finalProgress,
    reducedMotion,
    heroRef,
    finalRef,
  };
}
