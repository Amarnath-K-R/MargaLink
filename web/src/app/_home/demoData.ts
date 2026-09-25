import { Check, ShieldCheck } from "lucide-react";

// Illustrative content for the homepage's scroll narrative — not real
// journals or requests. The actual journal count (JournalsSection) and real
// match results (/match) come from the live index, not this file.

export const journalCards = [
  { title: "Freshwater Ecology Letters", field: "Ecology · Q1", score: "92%", fee: "No APC" },
  { title: "Journal of Survey Methods", field: "Statistics · Q2", score: "87%", fee: "$1,450 APC" },
  { title: "Field Notes in Hydrology", field: "Earth sciences · Q1", score: "81%", fee: "No APC" },
];

export const requestRows = [
  { verb: "GET", label: "journal index", note: "public file", icon: Check, noSend: false },
  { verb: "GET", label: "embedding model", note: "public file", icon: Check, noSend: false },
  { verb: "RUN", label: "similarity search", note: "on this device", icon: Check, noSend: false },
  { verb: "POST", label: "your paper's text", note: "never sent", icon: ShieldCheck, noSend: true },
];

export const reviewTiersData = [
  { name: "Quick", detail: "The 2–3 biggest issues", time: "~2 min", featured: false },
  { name: "Standard", detail: "Balanced coverage", time: "~5 min", featured: true },
  { name: "Thorough", detail: "Every subsection and table", time: "~12 min", featured: false },
];

export const privacyMetrics = [
  { value: "0", label: "copies of your paper stored on a server" },
  { value: "2", label: "opt-in features that send anything, each behind a notice" },
  { value: "Every", label: "request listed on the page as it happens" },
];
