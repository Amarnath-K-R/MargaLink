"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "margalink-seen-intro";
const HOLD_MS = 1600; // how long the fully-revealed intro sits before fading out

// One deliberate reveal, not decoration: the boundary that draws itself
// around the wordmark is the same visual language as the privacy page's
// "your browser" diagram — the first thing a visitor feels is the actual
// promise, before they've read a word of explanation.
//
// The real page underneath mounts normally the whole time; this just sits
// on top of it (position: fixed) and disappears — no route change, no
// layout shift, nothing else in the app is aware this exists.
export default function IntroOverlay() {
  const [visible, setVisible] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // private browsing / blocked storage — harmless either way, just
      // means the intro might play again next visit
    }
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // matchMedia unsupported — treat as no preference
    }
    if (seen || reduceMotion) {
      // localStorage/matchMedia don't exist during the server render (which
      // is why `visible` defaults to true, to match that server output) —
      // this is exactly the "sync with an external system after mount" case
      // useEffect exists for, not state that could be computed during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }

    const holdTimer = setTimeout(() => setFadingOut(true), HOLD_MS);
    const dismissOnKey = () => dismiss();
    document.addEventListener("keydown", dismissOnKey);
    return () => {
      clearTimeout(holdTimer);
      document.removeEventListener("keydown", dismissOnKey);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore — worst case the intro plays again next visit
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      onClick={dismiss}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-paper ${
        fadingOut ? "animate-intro-fadeout" : ""
      }`}
      onAnimationEnd={(e) => {
        if (e.animationName === "intro-fadeout") dismiss();
      }}
    >
      <div className="relative aspect-[5/2] w-[min(90vw,480px)]">
        <svg viewBox="0 0 100 40" className="absolute inset-0 h-full w-full" style={{ color: "var(--accent)" }}>
          <rect
            x="1"
            y="1"
            width="98"
            height="38"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
            pathLength="100"
            className="animate-intro-draw"
          />
        </svg>
        <div className="relative flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="animate-intro-word font-serif text-2xl font-medium sm:text-3xl">
            MargaLink
          </span>
          <span className="animate-intro-tagline text-sm text-ink-soft sm:text-base">
            Nothing about your paper leaves this tab.
          </span>
        </div>
      </div>
    </div>
  );
}
