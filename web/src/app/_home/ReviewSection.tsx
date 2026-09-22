import type { RefObject } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { between } from "@/lib/easing";
import { stagger, motionStyle } from "./motion.ts";
import { reviewTiersData } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function ReviewSection({
  reviewRef,
  reviewProgress,
  privacyProgress,
  reducedMotion,
}: {
  reviewRef: RefObject<HTMLElement | null>;
  reviewProgress: number;
  privacyProgress: number;
  reducedMotion: boolean;
}) {
  return (
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
  );
}
