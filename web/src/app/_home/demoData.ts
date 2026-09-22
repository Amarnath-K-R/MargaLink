import { Check, ShieldCheck } from "lucide-react";

// Illustrative marketing content for the homepage's scroll narrative — not
// real journals or requests. The actual journal count (JournalsSection) and
// real match results (/match) come from the live index, not this file.

export const journalCards = [
  { title: "Ecological Systems", field: "ECOLOGY · Q1", score: "92%", fee: "$0 APC" },
  { title: "Methods & Metrics", field: "DATA SCIENCE · Q2", score: "87%", fee: "$1,200 APC" },
  { title: "Field Notes", field: "INTERDISCIPLINARY · Q1", score: "81%", fee: "$0 APC" },
];

export const requestRows = [
  { verb: "GET", label: "journal-index.json", note: "local cache", icon: Check, noSend: false },
  { verb: "RUN", label: "embedding-model", note: "on device", icon: Check, noSend: false },
  { verb: "RUN", label: "similarity-search", note: "on device", icon: Check, noSend: false },
  { verb: "POST", label: "paper text", note: "not sent", icon: ShieldCheck, noSend: true },
];

export const reviewTiersData = [
  { name: "Quick", detail: "2–3 biggest issues", time: "~2 min", featured: false },
  { name: "Standard", detail: "Balanced coverage", time: "~5 min", featured: true },
  { name: "Thorough", detail: "Every subsection + table", time: "~12 min", featured: false },
];

export const privacyMetrics = [
  { value: "0", label: "paper text stored server-side" },
  { value: "1", label: "clear, optional exception" },
  { value: "∞", label: "ways to check the log" },
];
