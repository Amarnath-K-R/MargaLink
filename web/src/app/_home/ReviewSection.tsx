import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { between } from "@/lib/easing";
import { stagger, motionStyle } from "./motion.ts";
import { reviewTiersData } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function ReviewSection({
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
  const panelIn = between(progress, 0.72, 1);
  return (
    <section id="review" ref={sectionRef} className="story-section section-shell review-section">
      <div className="section-stage">
        <div
          className="review-sweep"
          aria-hidden="true"
          style={motionStyle(reducedMotion, {
            opacity: between(progress, 0.35, 0.5) * (1 - between(progress, 0.6, 0.82)) * (1 - between(next, 0, 0.5)),
          })}
        >
          <span className="review-sweep-bar" style={motionStyle(reducedMotion, { transform: `scaleX(${between(progress, 0.35, 0.5)})` })} />
          <span
            className="review-sweep-headline"
            style={motionStyle(reducedMotion, { clipPath: `inset(0 ${(1 - between(progress, 0.35, 0.5)) * 100}% 0 0)` })}
          >
            Nothing leaves without asking.
          </span>
        </div>

        <div className="story-grid">
          <div className="story-copy">
            <div style={motionStyle(reducedMotion, stagger(copyIn, 0, 4, 22))}>
              <StageLabel number="04" label="Review, only if you ask" />
            </div>
            <h2 style={motionStyle(reducedMotion, stagger(copyIn, 1, 4, 22))}>When text needs to leave, you see the door.</h2>
            <p style={motionStyle(reducedMotion, stagger(copyIn, 2, 4, 22))}>
              The AI review is the one step that sends your paper&apos;s text off the device. You pick the journal and
              the depth, read exactly what will be sent, and say yes — every time. Nothing is kept afterwards.
            </p>
            <div className="away-note" style={motionStyle(reducedMotion, stagger(copyIn, 3, 4, 22))}>
              <span className="away-dot" aria-hidden="true" />
              <span>
                <strong>One of two opt-in exceptions</strong>
                <small>The other is Ask Claude in the figure studio, which sends column names — never your data.</small>
              </span>
            </div>
          </div>
          <div
            className="review-panel"
            style={motionStyle(reducedMotion, {
              opacity: panelIn * (1 - next * 0.35),
              transform: `scale(${0.9 + panelIn * 0.1 - next * 0.05}) translateY(${(1 - panelIn) * 24}px)`,
              filter: `blur(${next * 4}px)`,
            })}
          >
            <div className="review-consent" style={motionStyle(reducedMotion, { clipPath: `inset(0% 0% ${(1 - panelIn) * 100}% 0%)` })}>
              <span className="consent-kicker">Before anything is sent</span>
              <strong>This would leave your device.</strong>
              <span className="consent-status">Off until you agree</span>
            </div>
            <div className="review-tiers">
              {reviewTiersData.map((tier, index) => (
                <div
                  key={tier.name}
                  className={tier.featured ? "tier featured" : "tier"}
                  style={motionStyle(reducedMotion, stagger(panelIn, index, reviewTiersData.length, 18))}
                >
                  <span className="tier-radio" aria-hidden="true" />
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
                <Sparkles size={15} aria-hidden="true" /> Optional AI review
              </span>
              <Link href="/review" className="button button-small">
                Choose depth <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
