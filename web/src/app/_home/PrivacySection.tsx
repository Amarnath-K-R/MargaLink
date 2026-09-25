import Link from "next/link";
import { ArrowUpRight, ScanLine } from "lucide-react";
import { stagger, motionStyle } from "./motion.ts";
import { privacyMetrics } from "./demoData.ts";
import { StageLabel } from "./atoms.tsx";

export default function PrivacySection({
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
  return (
    <section id="privacy" ref={sectionRef} className="privacy-section section-shell">
      <div
        className="privacy-inner"
        style={motionStyle(reducedMotion, {
          opacity: progress * (1 - next * 0.4),
          transform: `translateY(${(1 - progress) * 30}px) scale(${1 - next * 0.04})`,
          filter: `blur(${next * 3}px)`,
        })}
      >
        <div className="privacy-icon" style={motionStyle(reducedMotion, stagger(progress, 0, 3, 16))}>
          <ScanLine size={22} aria-hidden="true" />
        </div>
        <div style={motionStyle(reducedMotion, stagger(progress, 1, 3, 16))}>
          <StageLabel number="06" label="The privacy promise" />
          <h2>Check it, don&apos;t trust it.</h2>
          <p>
            Every tool shows what stayed on the device and what — only with your consent — went elsewhere. The two
            features that can send anything out are the AI review and Ask Claude in the figure studio; both stop and
            ask first.
          </p>
          <Link href="/privacy" className="text-link section-link">
            How privacy works <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="privacy-metrics" style={motionStyle(reducedMotion, stagger(progress, 2, 3, 16))}>
          {privacyMetrics.map((metric, index) => (
            <div key={metric.label} style={motionStyle(reducedMotion, stagger(progress, index, privacyMetrics.length, 20, "x"))}>
              <span className="metric-value">{metric.value}</span>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
