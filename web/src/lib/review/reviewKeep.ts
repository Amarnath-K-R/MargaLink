// Where a finished review is kept: in this browser only (rule 2: nothing from
// a paper on our server). The /review page keeps the last one here; the
// writing workspace keeps each paper's with its project (Hub.tsx). Storage
// can be blocked or full: then nothing is kept and the review still shows.
import { parseKept } from "./reviewReport.ts";
import type { ReviewReport } from "./reviewTypes.ts";

export type ReviewKeeper = { load(): Promise<ReviewReport | null>; save(report: ReviewReport | null): Promise<void> };

const KEY = "margalink.lastReview";
export const browserKeeper: ReviewKeeper = {
  async load() {
    try {
      return parseKept(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  },
  async save(report) {
    try {
      if (report) localStorage.setItem(KEY, JSON.stringify(report));
      else localStorage.removeItem(KEY);
    } catch {
      // storage unavailable: the report still shows in this tab
    }
  },
};
