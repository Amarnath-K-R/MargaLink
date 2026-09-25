import type { RefObject } from "react";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { between } from "@/lib/easing";
import { stagger, motionStyle, decodeText } from "./motion.ts";
import { requestRows } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function MatchingSection({
  matchingRef,
  matchingProgress,
  reviewProgress,
  reducedMotion,
}: {
  matchingRef: RefObject<HTMLElement | null>;
  matchingProgress: number;
  reviewProgress: number;
  reducedMotion: boolean;
}) {
  return (
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
  );
}
