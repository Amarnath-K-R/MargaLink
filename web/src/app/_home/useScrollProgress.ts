"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { localProgress } from "./motion.ts";

export const SECTIONS = ["pathways", "journals", "matching", "review", "writing", "privacy", "final"] as const;
export type SectionName = (typeof SECTIONS)[number];
export type SectionProgress = Record<SectionName, number>;

const ZERO = Object.fromEntries(SECTIONS.map((s) => [s, 0])) as SectionProgress;

// Drives every scroll-linked value on the homepage: hero progress (the hero
// is taller than the viewport, so it has its own measure), each later
// section's local progress (localProgress — 0 until it scrolls into view, 1
// once it's mostly arrived), whether the page has scrolled at all (the
// header's background), and the reduced-motion preference. One rAF-throttled
// scroll listener drives all of it. Everything is section-local, so adding or
// resizing a section never shifts another section's choreography.
export function useScrollProgress() {
  const [heroProgress, setHeroProgress] = useState(0);
  const [sections, setSections] = useState<SectionProgress>(ZERO);
  const [scrolled, setScrolled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const refs = useRef<Partial<Record<SectionName, HTMLElement | null>>>({});
  // A ref callback per section, stable across renders.
  const [sectionRef] = useState(() => (name: SectionName) => (el: HTMLElement | null) => {
    refs.current[name] = el;
  });

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
        setScrolled(window.scrollY > 24);
        const hero = heroRef.current;
        if (hero) {
          const travel = Math.max(hero.offsetHeight - viewportHeight, 1);
          setHeroProgress(Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / travel)));
        }
        const next = { ...ZERO };
        for (const name of SECTIONS) {
          const el = refs.current[name];
          if (el) next[name] = localProgress(el.getBoundingClientRect(), viewportHeight);
        }
        setSections(next);
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

  return { heroProgress, sections, scrolled, reducedMotion, heroRef: heroRef as RefObject<HTMLElement | null>, sectionRef };
}
