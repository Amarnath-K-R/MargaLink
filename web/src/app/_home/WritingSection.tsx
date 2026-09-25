import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { between } from "@/lib/easing";
import { stagger, motionStyle } from "./motion.ts";
import { StageLabel } from "./atoms.tsx";

const SOURCE = [
  ["cmd", "\\documentclass[journal]{IEEEtran}"],
  ["cmd", "\\usepackage{graphicx}"],
  ["cmd", "\\begin{document}"],
  ["txt", "\\title{Seasonal nitrate flux in"],
  ["txt", "  headwater streams}"],
  ["cmd", "\\begin{figure}[t]"],
  ["txt", "  \\includegraphics{figures/flux.pdf}"],
  ["cmd", "\\end{figure}"],
] as const;

const TEMPLATES = ["Elsevier", "IEEE", "ACM", "Plain article"];

export default function WritingSection({
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
  const panelIn = between(progress, 0.6, 0.95);
  return (
    <section id="writing" ref={sectionRef} className="story-section section-shell writing-section">
      <div className="story-grid">
        <div className="story-copy">
          <div style={motionStyle(reducedMotion, stagger(copyIn, 0, 4, 22))}>
            <StageLabel number="05" label="Write it and draw it" />
          </div>
          <h2 style={motionStyle(reducedMotion, stagger(copyIn, 1, 4, 22))}>The journal&apos;s template, compiled on your laptop.</h2>
          <p style={motionStyle(reducedMotion, stagger(copyIn, 2, 4, 22))}>
            Start from your journal&apos;s LaTeX template, edit the source, and compile to PDF with TeX Live running in
            the browser. Drafts are saved on this device; download a backup whenever you like. Figures come from the
            figure studio, drawn from your spreadsheet without it ever leaving the tab.
          </p>
          <div className="section-links" style={motionStyle(reducedMotion, stagger(copyIn, 3, 4, 22))}>
            <Link href="/write" className="text-link">
              Write the paper <ArrowUpRight size={15} />
            </Link>
            <Link href="/figures" className="text-link">
              Make figures <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
        <div
          className="writing-panel"
          aria-hidden="true"
          style={motionStyle(reducedMotion, {
            opacity: panelIn * (1 - next * 0.35),
            transform: `translateY(${(1 - panelIn) * 28}px) scale(${1 - next * 0.05})`,
            filter: `blur(${next * 4}px)`,
          })}
        >
          <div className="writing-source">
            <span className="writing-file">main.tex</span>
            <ol>
              {SOURCE.map(([kind, line], i) => (
                <li key={i} className={kind === "cmd" ? "tex-cmd" : undefined} style={motionStyle(reducedMotion, stagger(panelIn, i, SOURCE.length, 10))}>
                  {line}
                </li>
              ))}
            </ol>
          </div>
          <div className="writing-output">
            <span className="writing-status">
              <span className="privacy-dot" /> Compiled on this device · 0.4 s
            </span>
            <div className="writing-page">
              <span className="page-title" />
              <span className="page-line" />
              <span className="page-line short" />
              <span className="page-figure" />
              <span className="page-line" />
              <span className="page-line" />
              <span className="page-line short" />
            </div>
            <div className="writing-templates">
              {TEMPLATES.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
