"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import IntroSequence from "@/components/IntroSequence";
import ThreePaperScene from "@/components/ThreePaperScene";
import "./_home/home.css";

const journalCards = [
  { title: "Ecological Systems", field: "ECOLOGY · Q1", score: "92%", fee: "$0 APC" },
  { title: "Methods & Metrics", field: "DATA SCIENCE · Q2", score: "87%", fee: "$1,200 APC" },
  { title: "Field Notes", field: "INTERDISCIPLINARY · Q1", score: "81%", fee: "$0 APC" },
];

const requestRows = [
  { verb: "GET", label: "journal-index.json", note: "local cache", icon: Check, noSend: false },
  { verb: "RUN", label: "embedding-model", note: "on device", icon: Check, noSend: false },
  { verb: "RUN", label: "similarity-search", note: "on device", icon: Check, noSend: false },
  { verb: "POST", label: "paper text", note: "not sent", icon: ShieldCheck, noSend: true },
];

const reviewTiersData = [
  { name: "Quick", detail: "2–3 biggest issues", time: "~2 min", featured: false },
  { name: "Standard", detail: "Balanced coverage", time: "~5 min", featured: true },
  { name: "Thorough", detail: "Every subsection + table", time: "~12 min", featured: false },
];

const privacyMetrics = [
  { value: "0", label: "paper text stored server-side" },
  { value: "1", label: "clear, optional exception" },
  { value: "∞", label: "ways to check the log" },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

const reveal = (value: number, start: number, end: number) => {
  const normalized = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return normalized * normalized * (3 - 2 * normalized);
};

// Local 0→1 progress for how far a section has scrolled into view — 0 when its
// top is at the bottom of the viewport, 1 once it's mostly arrived. Unlike a
// fraction of total page scroll, this stays correct regardless of how long the
// page is or how tall any one section ends up being.
function localProgress(rect: DOMRect, viewportHeight: number) {
  const start = viewportHeight;
  const end = viewportHeight * 0.35;
  return Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
}

// A staggered cascade for a group of `count` siblings: item `index` gets its own
// reveal window within the section's local progress, so children arrive in
// sequence rather than all at once.
function stagger(progress: number, index: number, count: number, distance = 24, axis: "x" | "y" = "y") {
  const span = 0.55;
  const stepStart = count > 1 ? (index / (count - 1)) * (1 - span) : 0;
  const t = reveal(progress, stepStart, Math.min(1, stepStart + span));
  const shift = (1 - t) * distance;
  return { opacity: t, transform: axis === "x" ? `translateX(${shift}px)` : `translateY(${shift}px)` };
}

// Reduced-motion escape hatch: skip the computed transform entirely so content
// just renders at its natural position, fully visible, no scroll-linked motion.
function motionStyle(reducedMotion: boolean, style: CSSProperties): CSSProperties {
  return reducedMotion ? {} : style;
}

// t is an already-`reveal()`d 0→1 fraction; returns the counted-up integer.
function countUp(target: number, t: number) {
  return Math.round(target * t);
}

// A terminal-style decode: the first `text.length * t` characters are resolved,
// the rest are substituted from a fixed glyph set. `flicker` (a continuously
// changing value, e.g. the raw section progress) reseeds the substitution so
// unresolved characters visibly cycle as the visitor scrolls, and hold still
// the moment they stop.
const DECODE_GLYPHS = "!<>-_/[]{}=+*^?#0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function decodeText(text: string, t: number, flicker: number) {
  const revealCount = Math.floor(text.length * t);
  return text
    .split("")
    .map((char, index) => {
      if (char === " " || char === "." || index < revealCount) return char;
      const glyphIndex = Math.floor(index * 13 + flicker * 997) % DECODE_GLYPHS.length;
      return DECODE_GLYPHS[glyphIndex];
    })
    .join("");
}

function StageLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="stage-label">
      <span>{number}</span>
      <span>{label}</span>
    </div>
  );
}

function PrivacyPill({ children }: { children: ReactNode }) {
  return (
    <span className="privacy-pill">
      <span className="privacy-dot" />
      {children}
    </span>
  );
}

function Home() {
  const [progress, setProgress] = useState(0);
  const [heroProgress, setHeroProgress] = useState(0);
  const [journalsProgress, setJournalsProgress] = useState(0);
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [reviewProgress, setReviewProgress] = useState(0);
  const [privacyProgress, setPrivacyProgress] = useState(0);
  const [finalProgress, setFinalProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const journalsRef = useRef<HTMLElement>(null);
  const matchingRef = useRef<HTMLElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const privacyRef = useRef<HTMLElement>(null);
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

        if (journalsRef.current) setJournalsProgress(localProgress(journalsRef.current.getBoundingClientRect(), viewportHeight));
        if (matchingRef.current) setMatchingProgress(localProgress(matchingRef.current.getBoundingClientRect(), viewportHeight));
        if (reviewRef.current) setReviewProgress(localProgress(reviewRef.current.getBoundingClientRect(), viewportHeight));
        if (privacyRef.current) setPrivacyProgress(localProgress(privacyRef.current.getBoundingClientRect(), viewportHeight));
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

  const screenDive = useMemo(() => (reducedMotion ? 0 : reveal(progress, 0.12, 0.2)), [progress, reducedMotion]);
  const featureEntry = useMemo(() => (reducedMotion ? 1 : reveal(progress, 0.13, 0.21)), [progress, reducedMotion]);

  return (
    <div className="margalink-page">
      <ThreePaperScene progress={progress} heroProgress={heroProgress} reducedMotion={reducedMotion} />
      <div className="grain" aria-hidden="true" />

      <header className="site-header">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
          <span className="brand-mark">M</span>
          <span>MargaLink</span>
        </button>
        <div className="header-meta">
          <span className="mono header-note">PRIVATE BY DEFAULT</span>
          <button className="header-cta" onClick={() => scrollToId("pathways")}>
            Explore the workflow <ArrowUpRight size={15} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <main>
        <section id="hero" ref={heroRef} className="hero section-shell">
          <div
            className="hero-stage"
            style={{
              transform: `perspective(1200px) translateY(${screenDive * -120}px) scale(${1 + screenDive * 1.25}) rotateX(${screenDive * 3}deg)`,
              filter: `blur(${screenDive * 5}px)`,
              opacity: 1 - screenDive * 0.84,
            }}
          >
            <div
              className="hero-brand-landing"
              style={{
                opacity: 1 - reveal(heroProgress, 0.02, 0.18),
                transform: `translate(-50%, calc(-50% + ${reveal(heroProgress, 0.02, 0.18) * -22}px))`,
              }}
            >
              <span className="hero-brand-highlight">
                <span className="hero-brand-mark">M</span>
                <span>
                  Marga<em>Link</em>
                </span>
              </span>
              <span className="hero-brand-prompt">
                Scroll to open the paper <ChevronDown size={15} />
              </span>
            </div>
            <div className="hero-copy nonlinear-copy">
              <div className="eyebrow">
                <span className="eyebrow-line" /> A quieter way to publish
              </div>
              <div
                className="hero-word hero-word-keep"
                style={{
                  opacity: reveal(heroProgress, 0.04, 0.16),
                  transform: `translate3d(${(1 - reveal(heroProgress, 0.04, 0.16)) * -36}px, ${(1 - reveal(heroProgress, 0.04, 0.16)) * 28}px, 0) scale(${0.94 + reveal(heroProgress, 0.04, 0.16) * 0.06})`,
                }}
              >
                Keep
              </div>
              <div
                className="hero-word hero-word-paper"
                style={{
                  opacity: reveal(heroProgress, 0.16, 0.3),
                  transform: `translate3d(${(1 - reveal(heroProgress, 0.16, 0.3)) * 52}px, ${(1 - reveal(heroProgress, 0.16, 0.3)) * 22}px, 0) rotate(${(1 - reveal(heroProgress, 0.16, 0.3)) * -3}deg)`,
                }}
              >
                the paper.
              </div>
              <div
                className="hero-word hero-word-lose"
                style={{
                  opacity: reveal(heroProgress, 0.48, 0.64),
                  transform: `translate3d(${(1 - reveal(heroProgress, 0.48, 0.64)) * -20}px, ${(1 - reveal(heroProgress, 0.48, 0.64)) * 20}px, 0)`,
                }}
              >
                Lose the
              </div>
              <div
                className="hero-word hero-word-guess"
                style={{
                  opacity: reveal(heroProgress, 0.63, 0.79),
                  transform: `translate3d(${(1 - reveal(heroProgress, 0.63, 0.79)) * 34}px, ${(1 - reveal(heroProgress, 0.63, 0.79)) * 28}px, 0) scale(${0.92 + reveal(heroProgress, 0.63, 0.79) * 0.08})`,
                }}
              >
                guesswork.
              </div>
              <div
                className="hero-support"
                style={{
                  opacity: reveal(heroProgress, 0.77, 0.9),
                  transform: `translateY(${(1 - reveal(heroProgress, 0.77, 0.9)) * 22}px)`,
                }}
              >
                <p className="hero-deck">
                  MargaLink helps researchers find the right journal, check the fit, and ask for a review.
                </p>
                <div className="hero-privacy-line">
                  <span /> WITHOUT TREATING YOUR PAPER AS SERVER-SIDE DATA.
                </div>
                <div className="hero-actions">
                  <button className="button button-primary" onClick={() => scrollToId("pathways")}>
                    See how it works <ArrowDown size={16} />
                  </button>
                  <button className="text-link" onClick={() => scrollToId("privacy")}>
                    Read the privacy promise <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="hero-proof">
                  <PrivacyPill>Paper text stays in the tab</PrivacyPill>
                  <span className="hero-proof-note">One clear exception. Always opt-in.</span>
                </div>
              </div>
            </div>
            <div className="hero-coordinate mono">
              37°46′N / 122°25′W
              <br />
              <span>LOCAL / INDEXED / HUMAN</span>
            </div>
            <div className="scroll-hint">
              <span>SCROLL TO TRACE THE REVEAL</span>
              <ChevronDown size={16} />
            </div>
          </div>
        </section>

        <section id="pathways" className="story-section section-shell feature-entry">
          <div
            className="feature-screen-frame"
            style={{
              opacity: 0.86 + featureEntry * 0.14,
              transform: `perspective(1200px) translateY(${(1 - featureEntry) * 34}px) scale(${0.96 + featureEntry * 0.04}) rotateX(${(1 - featureEntry) * 3}deg)`,
            }}
          >
            <div className="feature-screen-topline">
              <span>01 / THE WORKFLOW</span>
              <span>NOTEBOOK / OPENING PAGE</span>
            </div>

            <div
              className="pathways-stamp"
              style={motionStyle(reducedMotion, {
                opacity: 1 - reveal(progress, 0.235, 0.26),
                transform: `translateY(${-reveal(progress, 0.235, 0.26) * 30}px) scale(${1 - reveal(progress, 0.235, 0.26) * 0.15})`,
              })}
            >
              <span
                style={motionStyle(reducedMotion, {
                  opacity: reveal(progress, 0.14, 0.19),
                  transform: `scale(${1.18 - reveal(progress, 0.14, 0.19) * 0.18}) rotate(${(1 - reveal(progress, 0.14, 0.19)) * -5}deg)`,
                })}
              >
                Before submission.
              </span>
              <span
                className="pathways-stamp-accent"
                style={motionStyle(reducedMotion, {
                  opacity: reveal(progress, 0.17, 0.22),
                  transform: `scale(${1.18 - reveal(progress, 0.17, 0.22) * 0.18}) rotate(${(1 - reveal(progress, 0.17, 0.22)) * 5}deg)`,
                })}
              >
                there is a better first move.
              </span>
            </div>

            <div className="story-grid">
              <div
                className="story-copy"
                style={motionStyle(reducedMotion, {
                  opacity: reveal(progress, 0.25, 0.37),
                  transform: `translateY(${(1 - reveal(progress, 0.25, 0.37)) * 24}px)`,
                })}
              >
                <StageLabel number="01" label="Start with the paper" />
                <p>
                  Three focused tools for the decisions researchers actually make: where to publish, whether the
                  paper fits, and what deserves another look.
                </p>
              </div>
              <div
                className="workflow-list"
                style={motionStyle(reducedMotion, {
                  transform: `translateX(${(1 - reveal(progress, 0.25, 0.37)) * 30 - journalsProgress * 36}px)`,
                  opacity: reveal(progress, 0.25, 0.37) * (1 - journalsProgress * 0.45),
                })}
              >
                <button className="workflow-row" onClick={() => scrollToId("journals")}>
                  <span className="workflow-index">01</span>
                  <span>
                    <strong>Browse journals</strong>
                    <small>Fees, fields, indexing—no upload needed.</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
                <button className="workflow-row" onClick={() => scrollToId("matching")}>
                  <span className="workflow-index">02</span>
                  <span>
                    <strong>Match your paper</strong>
                    <small>Local fit scoring and a structural format check.</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
                <button className="workflow-row" onClick={() => scrollToId("review")}>
                  <span className="workflow-index">03</span>
                  <span>
                    <strong>Get it reviewed</strong>
                    <small>Optional AI review, disclosed at the boundary.</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="journals" ref={journalsRef} className="story-section section-shell journal-section">
          <div className="section-stage">
          <div
            className="journals-count"
            style={motionStyle(reducedMotion, {
              opacity:
                reveal(journalsProgress, 0.35, 0.5) *
                (1 - reveal(journalsProgress, 0.55, 0.75)) *
                (1 - reveal(matchingProgress, 0, 0.5)),
              transform: `translateY(${-reveal(journalsProgress, 0.55, 0.75) * 14}px) scale(${1 - reveal(journalsProgress, 0.55, 0.75) * 0.1})`,
            })}
          >
            <span className="journals-count-number">
              {countUp(4281, reducedMotion ? 1 : reveal(journalsProgress, 0.35, 0.5)).toLocaleString("en-US")}
            </span>
            <span className="journals-count-caption">Journals indexed, zero uploads</span>
          </div>

          <div className="story-grid reverse-mobile">
            <div
              className="story-copy"
              style={motionStyle(reducedMotion, {
                opacity: reveal(journalsProgress, 0.25, 1),
                transform: `translateX(${(1 - reveal(journalsProgress, 0.25, 1)) * -36}px)`,
              })}
            >
              <StageLabel number="02" label="Find the right journal" />
              <h2>Start with the landscape, not the upload button.</h2>
              <p>
                Browse a hand-shaped journal index by field, fees, and indexing before your paper goes anywhere near
                a workflow.
              </p>
              <div className="micro-note">
                <span className="micro-rule" /> NO FILE REQUIRED
              </div>
            </div>
            <div
              className="journal-panel"
              style={motionStyle(reducedMotion, {
                opacity: reveal(journalsProgress, 0.65, 0.95) * (1 - matchingProgress * 0.35),
                transform: `translateX(${(1 - reveal(journalsProgress, 0.65, 0.95)) * 56}px) scale(${1 - matchingProgress * 0.06})`,
                filter: `blur(${matchingProgress * 4}px)`,
              })}
            >
              <div className="panel-topline">
                <span>JOURNAL INDEX / 4,281 RECORDS</span>
                <span className="mono">LIVE</span>
              </div>
              <div className="journal-cards">
                {journalCards.map((card, index) => (
                  <div
                    className={index === 0 ? "journal-card selected" : "journal-card"}
                    key={card.title}
                    style={motionStyle(
                      reducedMotion,
                      stagger(reveal(journalsProgress, 0.65, 0.95), index, journalCards.length, 20),
                    )}
                  >
                    <div className="card-number">0{index + 1}</div>
                    <div className="card-content">
                      <span className="mono">{card.field}</span>
                      <strong>{card.title}</strong>
                      <small>{card.fee}</small>
                    </div>
                    <div className="score">
                      <span>{card.score}</span>
                      <small>fit</small>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/journals" className="panel-footer">
                <span>Index source / verified guidelines</span>
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
          </div>
        </section>

        <section id="matching" ref={matchingRef} className="story-section section-shell match-section">
          <div className="section-stage">
          <div
            className="matching-decode"
            style={motionStyle(reducedMotion, {
              opacity:
                reveal(matchingProgress, 0.35, 0.5) *
                (1 - reveal(matchingProgress, 0.55, 0.75)) *
                (1 - reveal(reviewProgress, 0, 0.5)),
              transform: `translateY(${-reveal(matchingProgress, 0.55, 0.75) * 14}px)`,
            })}
          >
            <span>
              {decodeText(
                "Everything stays on-device.",
                reducedMotion ? 1 : reveal(matchingProgress, 0.35, 0.5),
                matchingProgress,
              )}
            </span>
          </div>

          <div className="story-grid">
            <div className="story-copy">
              <div style={motionStyle(reducedMotion, stagger(reveal(matchingProgress, 0.3, 1), 0, 4, 22))}>
                <StageLabel number="03" label="Keep it in the tab" />
              </div>
              <h2 style={motionStyle(reducedMotion, stagger(reveal(matchingProgress, 0.3, 1), 1, 4, 22))}>
                Your paper can find its fit without leaving your browser.
              </h2>
              <p style={motionStyle(reducedMotion, stagger(reveal(matchingProgress, 0.3, 1), 2, 4, 22))}>
                Match runs on-device. Structural checks look at word count, sections, and references while a live
                request log shows exactly what crossed the network boundary.
              </p>
              <div
                className="privacy-lock"
                style={motionStyle(reducedMotion, stagger(reveal(matchingProgress, 0.3, 1), 3, 4, 22))}
              >
                <LockKeyhole size={17} />
                <span>
                  <strong>LOCAL BY DESIGN</strong>
                  <small>Embeddings + similarity search happen in-browser.</small>
                </span>
              </div>
            </div>
            <div
              className="network-panel"
              style={motionStyle(reducedMotion, {
                opacity: reveal(matchingProgress, 0.65, 0.95) * (1 - reviewProgress * 0.35),
                transform: `scale(${0.88 + reveal(matchingProgress, 0.65, 0.95) * 0.12 - reviewProgress * 0.06}) translateY(${(1 - reveal(matchingProgress, 0.65, 0.95)) * 26}px)`,
                filter: `blur(${reviewProgress * 4}px)`,
              })}
            >
              <div className="network-head">
                <div>
                  <span className="panel-label">NETWORK ACTIVITY</span>
                  <strong>Nothing from the paper left this tab.</strong>
                </div>
                <span className="request-count mono">04 REQUESTS</span>
              </div>
              <div className="request-list">
                {requestRows.map((row, index) => {
                  const Icon = row.icon;
                  return (
                    <div
                      key={row.label}
                      className={row.noSend ? "request-row no-send" : "request-row"}
                      style={motionStyle(
                        reducedMotion,
                        stagger(reveal(matchingProgress, 0.65, 0.95), index, requestRows.length, 16),
                      )}
                    >
                      <Icon size={14} />
                      <span className="mono">{row.verb}</span>
                      <strong>{row.label}</strong>
                      <small>{row.note}</small>
                    </div>
                  );
                })}
              </div>
              <Link href="/match" className="match-result">
                <span className="result-mark">92</span>
                <span>
                  <strong>Best fit found</strong>
                  <small>Ecological Systems · structure passes 8/8</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          </div>
        </section>

        <section id="review" ref={reviewRef} className="story-section section-shell review-section">
          <div className="section-stage">
          <div
            className="review-sweep"
            style={motionStyle(reducedMotion, {
              opacity:
                reveal(reviewProgress, 0.35, 0.5) *
                (1 - reveal(reviewProgress, 0.6, 0.82)) *
                (1 - reveal(privacyProgress, 0, 0.5)),
            })}
          >
            <span
              className="review-sweep-bar"
              style={motionStyle(reducedMotion, { transform: `scaleX(${reveal(reviewProgress, 0.35, 0.5)})` })}
            />
            <span
              className="review-sweep-headline"
              style={motionStyle(reducedMotion, {
                clipPath: `inset(0 ${(1 - reveal(reviewProgress, 0.35, 0.5)) * 100}% 0 0)`,
              })}
            >
              Nothing leaves without asking.
            </span>
          </div>

          <div className="story-grid reverse-mobile">
            <div className="story-copy">
              <div style={motionStyle(reducedMotion, stagger(reveal(reviewProgress, 0.3, 1), 0, 4, 22))}>
                <StageLabel number="04" label="Review by consent" />
              </div>
              <h2 style={motionStyle(reducedMotion, stagger(reveal(reviewProgress, 0.3, 1), 1, 4, 22))}>
                When text needs to leave, the boundary is visible.
              </h2>
              <p style={motionStyle(reducedMotion, stagger(reveal(reviewProgress, 0.3, 1), 2, 4, 22))}>
                Choose a shortlist, pick the depth, and decide every time. The one step that sends paper text away
                from the device is never hidden in the fine print.
              </p>
              <div
                className="away-note"
                style={motionStyle(reducedMotion, stagger(reveal(reviewProgress, 0.3, 1), 3, 4, 22))}
              >
                <span className="away-dot" />
                <span>
                  <strong>THE ONLY EXCEPTION</strong>
                  <small>AI review is opt-in, disclosed, and never default-on.</small>
                </span>
              </div>
            </div>
            <div
              className="review-panel"
              style={motionStyle(reducedMotion, {
                opacity: reveal(reviewProgress, 0.72, 1) * (1 - privacyProgress * 0.35),
                transform: `scale(${0.9 + reveal(reviewProgress, 0.72, 1) * 0.1 - privacyProgress * 0.05}) translateY(${(1 - reveal(reviewProgress, 0.72, 1)) * 24}px)`,
                filter: `blur(${privacyProgress * 4}px)`,
              })}
            >
              <div
                className="review-consent"
                style={motionStyle(reducedMotion, {
                  clipPath: `inset(0% 0% ${(1 - reveal(reviewProgress, 0.72, 1)) * 100}% 0%)`,
                })}
              >
                <span className="mono">CONSENT GATE</span>
                <strong>This would leave your device.</strong>
                <span className="consent-status">OFF BY DEFAULT</span>
              </div>
              <div className="review-tiers">
                {reviewTiersData.map((tier, index) => (
                  <div
                    key={tier.name}
                    className={tier.featured ? "tier featured" : "tier"}
                    style={motionStyle(
                      reducedMotion,
                      stagger(reveal(reviewProgress, 0.72, 1), index, reviewTiersData.length, 18),
                    )}
                  >
                    <span className="tier-radio" />
                    <span>
                      <strong>{tier.name}</strong>
                      <small>{tier.detail}</small>
                    </span>
                    <span className="tier-time">{tier.time}</span>
                  </div>
                ))}
              </div>
              <div className="review-foot">
                <span>
                  <Sparkles size={15} /> Optional Claude review
                </span>
                <Link href="/review" className="button button-small">
                  Choose depth <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section id="privacy" ref={privacyRef} className="privacy-section section-shell">
          <div
            className="privacy-inner"
            style={motionStyle(reducedMotion, {
              opacity: privacyProgress * (1 - finalProgress * 0.4),
              transform: `translateY(${(1 - privacyProgress) * 30}px) scale(${1 - finalProgress * 0.04})`,
              filter: `blur(${finalProgress * 3}px)`,
            })}
          >
            <div className="privacy-icon" style={motionStyle(reducedMotion, stagger(privacyProgress, 0, 3, 16))}>
              <ScanLine size={22} />
            </div>
            <div style={motionStyle(reducedMotion, stagger(privacyProgress, 1, 3, 16))}>
              <StageLabel number="05" label="The privacy promise" />
              <h2>No trust required.</h2>
              <p>
                Every meaningful privacy claim is made visible in the product itself: what stayed local, what was
                checked, and what—only with consent—went elsewhere.
              </p>
            </div>
            <div className="privacy-metrics" style={motionStyle(reducedMotion, stagger(privacyProgress, 2, 3, 16))}>
              {privacyMetrics.map((metric, index) => (
                <div
                  key={metric.label}
                  style={motionStyle(reducedMotion, stagger(privacyProgress, index, privacyMetrics.length, 20, "x"))}
                >
                  <span className="metric-value">{metric.value}</span>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section ref={finalRef} className="final-section section-shell">
          <div className="final-kicker" style={motionStyle(reducedMotion, stagger(finalProgress, 0, 4, 30))}>
            <span className="eyebrow-line" /> YOUR NEXT MOVE
          </div>
          <h2 style={motionStyle(reducedMotion, stagger(finalProgress, 1, 4, 30))}>
            Make the next submission
            <br />
            <em>feel more considered.</em>
          </h2>
          <p style={motionStyle(reducedMotion, stagger(finalProgress, 2, 4, 30))}>
            Browse first. Match privately. Review only when you choose.
          </p>
          <div className="final-actions" style={motionStyle(reducedMotion, stagger(finalProgress, 3, 4, 30))}>
            <Link href="/journals" className="button button-primary">
              Browse journals <ArrowUpRight size={16} />
            </Link>
            <Link href="/match" className="button button-quiet">
              Match your paper <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="final-footer">
            <span>© 2026 MargaLink</span>
            <span className="mono">CALM TOOLS FOR SERIOUS PAPERS</span>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Back to top <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
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
