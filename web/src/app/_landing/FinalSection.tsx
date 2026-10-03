import type { RefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { stagger, motionStyle } from "./motion.ts";
import TypedPaper from "./TypedPaper.tsx";

// The closing section: the call to action on the left, and on the right the
// page the landing's desk morphed into, writing itself (`writePaper` flips
// true once the 3D paper has handed over — see page.tsx). On wider screens
// the desk's 3D paper stands up beside it instead, and page.tsx pins this
// section while that paper writes itself.
export default function FinalSection({
  finalRef,
  finalProgress,
  onOpenTools,
  writePaper,
  paperShown,
  reducedMotion,
}: {
  finalRef: RefObject<HTMLElement | null>;
  finalProgress: number;
  onOpenTools: () => void;
  writePaper: boolean;
  paperShown: number;
  reducedMotion: boolean;
}) {
  return (
    <section ref={finalRef} className="final-section section-shell">
      <div className="final-grid">
        <div className="final-copy">
          <div className="final-kicker" style={motionStyle(reducedMotion, stagger(finalProgress, 0, 4, 30))}>
            <span className="eyebrow-line" /> YOUR NEXT MOVE
          </div>
          <h2 style={motionStyle(reducedMotion, stagger(finalProgress, 1, 4, 30))}>
            Make the next submission
            <br />
            <em>feel more considered.</em>
          </h2>
          <p style={motionStyle(reducedMotion, stagger(finalProgress, 2, 4, 30))}>
            Browse first. Match privately. Review only when you choose.
          </p>
          <div className="final-actions" style={motionStyle(reducedMotion, stagger(finalProgress, 3, 4, 30))}>
            <button type="button" className="button button-primary" onClick={onOpenTools}>
              Explore our tools <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className="final-paper" style={{ opacity: reducedMotion ? 1 : paperShown }}>
          <TypedPaper write={writePaper} reducedMotion={reducedMotion} />
        </div>
      </div>
    </section>
  );
}
