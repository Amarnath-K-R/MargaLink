import type { RefObject } from "react";
import { ScanLine } from "lucide-react";
import { stagger, motionStyle } from "./motion.ts";
import { privacyMetrics } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function PrivacySection({
  privacyRef,
  privacyProgress,
  finalProgress,
  reducedMotion,
}: {
  privacyRef: RefObject<HTMLElement | null>;
  privacyProgress: number;
  finalProgress: number;
  reducedMotion: boolean;
}) {
  return (
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
  );
}
