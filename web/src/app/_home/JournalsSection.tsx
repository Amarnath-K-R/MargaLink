"use client";

import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { loadManifest } from "@/lib/manifest";
import { stagger, motionStyle, countUp } from "./motion.ts";
import { journalCards } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

// Static fallback matching the real index as of this build — replaced by
// the live count from loadManifest() once it resolves. Previously this
// (and the panel topline below) hardcoded "4,281", a stale number left
// over from an early build; the real index has grown to 18,125+ since.
const FALLBACK_JOURNAL_COUNT = 18125;

export default function JournalsSection({
  journalsRef,
  journalsProgress,
  matchingProgress,
  reducedMotion,
}: {
  journalsRef: RefObject<HTMLElement | null>;
  journalsProgress: number;
  matchingProgress: number;
  reducedMotion: boolean;
}) {
  const [journalCount, setJournalCount] = useState(FALLBACK_JOURNAL_COUNT);

  useEffect(() => {
    loadManifest()
      .then((manifest) => setJournalCount(manifest.journal_count))
      .catch(() => {});
  }, []);

  return (
    <section id="journals" ref={journalsRef} className="story-section section-shell journal-section">
      <div className="section-stage">
      <div
        className="journals-count"
        style={motionStyle(reducedMotion, {
          opacity:
            between(journalsProgress, 0.35, 0.5) *
            (1 - between(journalsProgress, 0.55, 0.75)) *
            (1 - between(matchingProgress, 0, 0.5)),
          transform: `translateY(${-between(journalsProgress, 0.55, 0.75) * 14}px) scale(${1 - between(journalsProgress, 0.55, 0.75) * 0.1})`,
        })}
      >
        <span className="journals-count-number">
          {countUp(journalCount, reducedMotion ? 1 : between(journalsProgress, 0.35, 0.5)).toLocaleString("en-US")}
        </span>
        <span className="journals-count-caption">Journals indexed, zero uploads</span>
      </div>

      <div className="story-grid reverse-mobile">
        <div
          className="story-copy"
          style={motionStyle(reducedMotion, {
            opacity: between(journalsProgress, 0.25, 1),
            transform: `translateX(${(1 - between(journalsProgress, 0.25, 1)) * -36}px)`,
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
            opacity: between(journalsProgress, 0.65, 0.95) * (1 - matchingProgress * 0.35),
            transform: `translateX(${(1 - between(journalsProgress, 0.65, 0.95)) * 56}px) scale(${1 - matchingProgress * 0.06})`,
            filter: `blur(${matchingProgress * 4}px)`,
          })}
        >
          <div className="panel-topline">
            <span>JOURNAL INDEX / {journalCount.toLocaleString()} RECORDS</span>
            <span className="mono">LIVE</span>
          </div>
          <div className="journal-cards">
            {journalCards.map((card, index) => (
              <div
                className={index === 0 ? "journal-card selected" : "journal-card"}
                key={card.title}
                style={motionStyle(
                  reducedMotion,
                  stagger(between(journalsProgress, 0.65, 0.95), index, journalCards.length, 20),
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
  );
}
