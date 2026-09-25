import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { between } from "@/lib/easing";
import { stagger, motionStyle, decodeText } from "./motion.ts";
import { requestRows } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function MatchingSection({
  sectionRef,
  progress,
  next,
  reducedMotion,
}: {
  sectionRef: (el: HTMLElement | null) => void;
  progress: number;
  next: number;
  reducedMotion: boolean;
}) {
  const copyIn = between(progress, 0.3, 1);
  const panelIn = between(progress, 0.65, 0.95);
  return (
    <section id="matching" ref={sectionRef} className="story-section section-shell match-section">
      <div className="section-stage">
        <div
          className="matching-decode"
          aria-hidden="true"
          style={motionStyle(reducedMotion, {
            opacity: between(progress, 0.35, 0.5) * (1 - between(progress, 0.55, 0.75)) * (1 - between(next, 0, 0.5)),
            transform: `translateY(${-between(progress, 0.55, 0.75) * 14}px)`,
          })}
        >
          <span>{decodeText("Everything stays on this device.", reducedMotion ? 1 : between(progress, 0.35, 0.5), progress)}</span>
        </div>

        <div className="story-grid">
          <div className="story-copy">
            <div style={motionStyle(reducedMotion, stagger(copyIn, 0, 4, 22))}>
              <StageLabel number="03" label="Match without uploading" />
            </div>
            <h2 style={motionStyle(reducedMotion, stagger(copyIn, 1, 4, 22))}>
              Your paper finds its fit without leaving the browser.
            </h2>
            <p style={motionStyle(reducedMotion, stagger(copyIn, 2, 4, 22))}>
              Matching reads your title, abstract and references on this device and ranks journals against them. The
              structure check looks at word count, sections and references, and a live log on the page lists every
              request the page makes.
            </p>
            <div className="privacy-lock" style={motionStyle(reducedMotion, stagger(copyIn, 3, 4, 22))}>
              <LockKeyhole size={17} aria-hidden="true" />
              <span>
                <strong>Local by design</strong>
                <small>The model and the journal index download once; your paper never uploads.</small>
              </span>
            </div>
            <Link href="/match" className="text-link section-link" style={motionStyle(reducedMotion, stagger(copyIn, 3, 4, 22))}>
              Match your paper <ArrowUpRight size={15} />
            </Link>
          </div>
          <div
            className="network-panel"
            style={motionStyle(reducedMotion, {
              opacity: panelIn * (1 - next * 0.35),
              transform: `scale(${0.88 + panelIn * 0.12 - next * 0.06}) translateY(${(1 - panelIn) * 26}px)`,
              filter: `blur(${next * 4}px)`,
            })}
          >
            <div className="network-head">
              <div>
                <span className="panel-label">Network activity</span>
                <strong>Nothing from the paper left this tab.</strong>
              </div>
              <span className="request-count">{requestRows.length - 1} requests</span>
            </div>
            <div className="request-list">
              {requestRows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.label}
                    className={row.noSend ? "request-row no-send" : "request-row"}
                    style={motionStyle(reducedMotion, stagger(panelIn, index, requestRows.length, 16))}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span className="request-verb">{row.verb}</span>
                    <strong>{row.label}</strong>
                    <small>{row.note}</small>
                  </div>
                );
              })}
            </div>
            <div className="match-result">
              <span className="result-mark">92</span>
              <span>
                <strong>Best fit: Freshwater Ecology Letters</strong>
                <small>Example result · structure check passes 8 of 8</small>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
