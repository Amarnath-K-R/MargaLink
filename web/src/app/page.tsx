"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole, ScanLine, Sparkles } from "lucide-react";
import { between } from "@/lib/easing";
import { useScrollProgress } from "./_home/useScrollProgress.ts";
import { stagger, motionStyle, decodeText } from "./_home/motion.ts";
import { requestRows, reviewTiersData, privacyMetrics } from "./_home/demoData.ts";
import { StageLabel } from "./_home/atoms.tsx";
import SiteHeader from "./_home/SiteHeader.tsx";
import HeroSection from "./_home/HeroSection.tsx";
import PathwaysSection from "./_home/PathwaysSection.tsx";
import JournalsSection from "./_home/JournalsSection.tsx";
import IntroSequence from "@/components/IntroSequence";
import ThreePaperScene from "@/components/ThreePaperScene";
import "./_home/home.css";

function Home() {
  const {
    progress,
    heroProgress,
    journalsProgress,
    matchingProgress,
    reviewProgress,
    privacyProgress,
    finalProgress,
    reducedMotion,
    heroRef,
    journalsRef,
    matchingRef,
    reviewRef,
    privacyRef,
    finalRef,
  } = useScrollProgress();

  const screenDive = useMemo(() => (reducedMotion ? 0 : between(progress, 0.12, 0.2)), [progress, reducedMotion]);
  const featureEntry = useMemo(() => (reducedMotion ? 1 : between(progress, 0.13, 0.21)), [progress, reducedMotion]);

  return (
    <div className="margalink-page">
      <ThreePaperScene progress={progress} heroProgress={heroProgress} reducedMotion={reducedMotion} />
      <div className="grain" aria-hidden="true" />

      <SiteHeader />

      <main>
        <HeroSection heroRef={heroRef} heroProgress={heroProgress} screenDive={screenDive} />

        <PathwaysSection
          progress={progress}
          reducedMotion={reducedMotion}
          featureEntry={featureEntry}
          journalsProgress={journalsProgress}
        />

        <JournalsSection
          journalsRef={journalsRef}
          journalsProgress={journalsProgress}
          matchingProgress={matchingProgress}
          reducedMotion={reducedMotion}
        />

        <section id="matching" ref={matchingRef} className="story-section section-shell match-section">
          <div className="section-stage">
          <div
            className="matching-decode"
            style={motionStyle(reducedMotion, {
              opacity:
                between(matchingProgress, 0.35, 0.5) *
                (1 - between(matchingProgress, 0.55, 0.75)) *
                (1 - between(reviewProgress, 0, 0.5)),
              transform: `translateY(${-between(matchingProgress, 0.55, 0.75) * 14}px)`,
            })}
          >
            <span>
              {decodeText(
                "Everything stays on-device.",
                reducedMotion ? 1 : between(matchingProgress, 0.35, 0.5),
                matchingProgress,
              )}
            </span>
          </div>

          <div className="story-grid">
            <div className="story-copy">
              <div style={motionStyle(reducedMotion, stagger(between(matchingProgress, 0.3, 1), 0, 4, 22))}>
                <StageLabel number="03" label="Keep it in the tab" />
              </div>
              <h2 style={motionStyle(reducedMotion, stagger(between(matchingProgress, 0.3, 1), 1, 4, 22))}>
                Your paper can find its fit without leaving your browser.
              </h2>
              <p style={motionStyle(reducedMotion, stagger(between(matchingProgress, 0.3, 1), 2, 4, 22))}>
                Match runs on-device. Structural checks look at word count, sections, and references while a live
                request log shows exactly what crossed the network boundary.
              </p>
              <div
                className="privacy-lock"
                style={motionStyle(reducedMotion, stagger(between(matchingProgress, 0.3, 1), 3, 4, 22))}
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
                opacity: between(matchingProgress, 0.65, 0.95) * (1 - reviewProgress * 0.35),
                transform: `scale(${0.88 + between(matchingProgress, 0.65, 0.95) * 0.12 - reviewProgress * 0.06}) translateY(${(1 - between(matchingProgress, 0.65, 0.95)) * 26}px)`,
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
                        stagger(between(matchingProgress, 0.65, 0.95), index, requestRows.length, 16),
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
                between(reviewProgress, 0.35, 0.5) *
                (1 - between(reviewProgress, 0.6, 0.82)) *
                (1 - between(privacyProgress, 0, 0.5)),
            })}
          >
            <span
              className="review-sweep-bar"
              style={motionStyle(reducedMotion, { transform: `scaleX(${between(reviewProgress, 0.35, 0.5)})` })}
            />
            <span
              className="review-sweep-headline"
              style={motionStyle(reducedMotion, {
                clipPath: `inset(0 ${(1 - between(reviewProgress, 0.35, 0.5)) * 100}% 0 0)`,
              })}
            >
              Nothing leaves without asking.
            </span>
          </div>

          <div className="story-grid reverse-mobile">
            <div className="story-copy">
              <div style={motionStyle(reducedMotion, stagger(between(reviewProgress, 0.3, 1), 0, 4, 22))}>
                <StageLabel number="04" label="Review by consent" />
              </div>
              <h2 style={motionStyle(reducedMotion, stagger(between(reviewProgress, 0.3, 1), 1, 4, 22))}>
                When text needs to leave, the boundary is visible.
              </h2>
              <p style={motionStyle(reducedMotion, stagger(between(reviewProgress, 0.3, 1), 2, 4, 22))}>
                Choose a shortlist, pick the depth, and decide every time. The one step that sends paper text away
                from the device is never hidden in the fine print.
              </p>
              <div
                className="away-note"
                style={motionStyle(reducedMotion, stagger(between(reviewProgress, 0.3, 1), 3, 4, 22))}
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
                opacity: between(reviewProgress, 0.72, 1) * (1 - privacyProgress * 0.35),
                transform: `scale(${0.9 + between(reviewProgress, 0.72, 1) * 0.1 - privacyProgress * 0.05}) translateY(${(1 - between(reviewProgress, 0.72, 1)) * 24}px)`,
                filter: `blur(${privacyProgress * 4}px)`,
              })}
            >
              <div
                className="review-consent"
                style={motionStyle(reducedMotion, {
                  clipPath: `inset(0% 0% ${(1 - between(reviewProgress, 0.72, 1)) * 100}% 0%)`,
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
                      stagger(between(reviewProgress, 0.72, 1), index, reviewTiersData.length, 18),
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
