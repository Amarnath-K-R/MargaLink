import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { motionStyle } from "./motion.ts";
import { StageLabel } from "./atoms.tsx";

const STEPS = [
  { href: "/journals", title: "Browse journals", detail: "Fees, fields and indexing — no upload needed." },
  { href: "/match", title: "Match your paper", detail: "Fit scoring and a structure check, on this device." },
  { href: "/review", title: "Get it reviewed", detail: "An optional AI review, only after you agree to send it." },
  { href: "/write", title: "Write it in their template", detail: "Your journal's LaTeX template, compiled in your browser." },
  { href: "/figures", title: "Make the figures", detail: "Publication-ready charts; your data never leaves the tab." },
];

// Section-local progress: `progress` is this section arriving, `next` is the
// journals section arriving (the list steps aside for it).
export default function PathwaysSection({
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
  const stampIn = between(progress, 0.05, 0.35);
  const stampOut = between(progress, 0.55, 0.75);
  const listIn = between(progress, 0.45, 0.9);
  return (
    <section id="pathways" ref={sectionRef} className="story-section section-shell">
      <div className="section-stage">
        <div
          className="pathways-stamp"
          aria-hidden="true"
          style={motionStyle(reducedMotion, {
            opacity: stampIn * (1 - stampOut),
            transform: `translateY(${-stampOut * 30}px) scale(${1 - stampOut * 0.12})`,
          })}
        >
          <span>Before you submit,</span>
          <span className="pathways-stamp-accent">there&apos;s a better first move.</span>
        </div>

        <div className="story-grid">
          <div
            className="story-copy"
            style={motionStyle(reducedMotion, { opacity: listIn, transform: `translateY(${(1 - listIn) * 24}px)` })}
          >
            <StageLabel number="01" label="The workflow" />
            <h2>Five tools for the decisions before submission.</h2>
            <p>
              Where to publish, whether the paper fits, what deserves another look, and how to get it into the
              journal&apos;s format — each one a page you can open on its own.
            </p>
          </div>
          <ol
            className="workflow-list"
            style={motionStyle(reducedMotion, {
              opacity: listIn * (1 - next * 0.45),
              transform: `translateX(${(1 - listIn) * 30 - next * 36}px)`,
            })}
          >
            {STEPS.map((s, i) => (
              <li key={s.href}>
                <Link href={s.href} className="workflow-row">
                  <span className="workflow-index">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{s.title}</strong>
                    <small>{s.detail}</small>
                  </span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
