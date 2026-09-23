import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { motionStyle } from "./motion.ts";
import { StageLabel, scrollToId } from "./atoms.tsx";

export default function PathwaysSection({
  progress,
  reducedMotion,
  featureEntry,
  journalsProgress,
}: {
  progress: number;
  reducedMotion: boolean;
  featureEntry: number;
  journalsProgress: number;
}) {
  return (
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
            opacity: 1 - between(progress, 0.235, 0.26),
            transform: `translateY(${-between(progress, 0.235, 0.26) * 30}px) scale(${1 - between(progress, 0.235, 0.26) * 0.15})`,
          })}
        >
          <span
            style={motionStyle(reducedMotion, {
              opacity: between(progress, 0.14, 0.19),
              transform: `scale(${1.18 - between(progress, 0.14, 0.19) * 0.18}) rotate(${(1 - between(progress, 0.14, 0.19)) * -5}deg)`,
            })}
          >
            Before submission.
          </span>
          <span
            className="pathways-stamp-accent"
            style={motionStyle(reducedMotion, {
              opacity: between(progress, 0.17, 0.22),
              transform: `scale(${1.18 - between(progress, 0.17, 0.22) * 0.18}) rotate(${(1 - between(progress, 0.17, 0.22)) * 5}deg)`,
            })}
          >
            there is a better first move.
          </span>
        </div>

        <div className="story-grid">
          <div
            className="story-copy"
            style={motionStyle(reducedMotion, {
              opacity: between(progress, 0.25, 0.37),
              transform: `translateY(${(1 - between(progress, 0.25, 0.37)) * 24}px)`,
            })}
          >
            <StageLabel number="01" label="Start with the paper" />
            <p>
              Focused tools for the decisions researchers actually make: where to publish, whether the
              paper fits, what deserves another look, and how to show the results.
            </p>
          </div>
          <div
            className="workflow-list"
            style={motionStyle(reducedMotion, {
              transform: `translateX(${(1 - between(progress, 0.25, 0.37)) * 30 - journalsProgress * 36}px)`,
              opacity: between(progress, 0.25, 0.37) * (1 - journalsProgress * 0.45),
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
            <Link href="/figures" className="workflow-row">
              <span className="workflow-index">04</span>
              <span>
                <strong>Make figures</strong>
                <small>Publication-ready charts — your data never leaves the tab.</small>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
