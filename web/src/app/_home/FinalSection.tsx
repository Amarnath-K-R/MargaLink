import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { stagger, motionStyle } from "./motion.ts";

export default function FinalSection({
  sectionRef,
  progress,
  reducedMotion,
}: {
  sectionRef: (el: HTMLElement | null) => void;
  progress: number;
  reducedMotion: boolean;
}) {
  return (
    <section ref={sectionRef} className="final-section section-shell">
      <p className="eyebrow" style={motionStyle(reducedMotion, stagger(progress, 0, 4, 30))}>
        <span className="eyebrow-line" /> Your next move
      </p>
      <h2 style={motionStyle(reducedMotion, stagger(progress, 1, 4, 30))}>
        Make the next submission <em>feel considered.</em>
      </h2>
      <p style={motionStyle(reducedMotion, stagger(progress, 2, 4, 30))}>Browse first. Match privately. Send nothing you didn&apos;t choose to.</p>
      <div className="final-actions" style={motionStyle(reducedMotion, stagger(progress, 3, 4, 30))}>
        <Link href="/match" className="button button-primary">
          Match your paper <ArrowRight size={16} />
        </Link>
        <Link href="/journals" className="text-link">
          Browse journals
        </Link>
      </div>
    </section>
  );
}
