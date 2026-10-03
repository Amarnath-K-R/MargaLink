// "What's new" on the dashboard (/home), newest first. To announce
// something, add an entry at the top: the date (YYYY-MM-DD), which part of
// MargaLink it's about, a title, a sentence or two, optional highlights, and
// where to try it. Entries on the same date are grouped under it.
import { CONTACT_EMAIL } from "@/lib/site";

export type UpdateTag = "Write" | "Match" | "Review" | "Figures" | "Journals" | "Guide" | "Design" | "Accounts";

export type Update = {
  date: string;
  tag: UpdateTag;
  title: string;
  summary: string;
  points?: string[];
  href?: string;
  cta?: string;
};

// Each tag wears its tool's bead colour.
export const TAG_TINT: Record<UpdateTag, string> = {
  Write: "#dde6e6",
  Match: "#cfe0e1",
  Review: "#ecdcc0",
  Figures: "#f1d2c2",
  Journals: "#efe3cf",
  Guide: "#ebe8df",
  Design: "#ebe8df",
  Accounts: "#f3e4bd",
};

export const UPDATES: Update[] = [
  {
    date: "2026-10-03",
    tag: "Write",
    title: "Rewrite with Claude",
    summary: "Select a passage in LaTeX or Word and have Claude paraphrase it, change its tone, shorten it, expand it, or make it clearer. Only the passage you select is sent, once you turn Rewrite on for that paper.",
    points: [
      "The rewrite comes back as a word diff: Replace, Try again or Discard",
      "Citations, equations and pictures stay on your device, and a rewrite that adds a number or drops a citation is refused",
      "1 M coin per 500 words, shown before you choose; refunded if it fails",
    ],
    href: "/write",
    cta: "Open the workspace",
  },
  {
    date: "2026-10-03",
    tag: "Write",
    title: "Spelling and grammar",
    summary: "Misspellings and grammar are underlined as you write, in LaTeX and in Word, checked in your browser. Nothing is sent anywhere, and it's free.",
    points: [
      "US, UK, Australian, Canadian or Indian English, chosen per paper",
      "Add to dictionary keeps a word with the paper",
      "Citation keys and LaTeX commands aren't marked",
    ],
    href: "/write",
    cta: "Open the workspace",
  },
  {
    date: "2026-10-02",
    tag: "Write",
    title: "Word documents in the workspace",
    summary: "Import a .docx, your paper or a journal's Word template, and edit it in the browser with the same tools around it. What you download is a Word document, the template's styles intact.",
    points: [
      "Formatting, pictures and tables in a Word editor, saved in this browser as you type",
      "Match, Checks and the AI review read the document; Jump to source selects the passage",
      "Figures from the studio go in at the cursor, at the size they were drawn",
    ],
    href: "/write",
    cta: "Open the workspace",
  },
  {
    date: "2026-10-02",
    tag: "Accounts",
    title: "The closed beta",
    summary: "MargaLink is open to invited testers for now, to hear what works before it opens to everyone. Testers sign in with Google and start with 50 M coins.",
    points: ["Every tool needs an invited account until the beta ends", "50 M coins to try the AI review and Ask Claude", `Tell us what to fix: ${CONTACT_EMAIL}`],
    href: "/account",
    cta: "Your account",
  },
  {
    date: "2026-09-28",
    tag: "Accounts",
    title: "Accounts and M coins",
    summary: "The AI review and Ask Claude now run on M coins, held in an account. New accounts get 10 M coins; everything else stays free, with no account.",
    points: [
      "Sign in with Google or an email link, without losing a loaded paper",
      "The price is on the button, and any part of a run that doesn't come back is refunded",
      "Coin packs, and Pro with 100 M coins a month",
    ],
    href: "/pricing",
    cta: "See pricing",
  },
  {
    date: "2026-09-28",
    tag: "Guide",
    title: "A guide to every tool",
    summary: "Every tool and every option, shown on the real screens with numbered notes, and a tour of how MargaLink is built, for developers and reviewers.",
    href: "/guide",
    cta: "Open the guide",
  },
  {
    date: "2026-09-28",
    tag: "Write",
    title: "Writing, full screen and easier",
    summary: "The workspace now fills the window, and it helps with the LaTeX.",
    points: [
      "A formatting bar: bold, headings, lists, maths, citations, references, figures and tables",
      "Suggestions as you type \\cite{, \\ref{ or \\begin{, from your own .bib and labels",
      "An outline of your headings that follows your \\input files",
      "Source, PDF or both; auto-compile; a word count against your journal's limit",
    ],
    href: "/write",
    cta: "Open the workspace",
  },
  {
    date: "2026-09-28",
    tag: "Design",
    title: "One calm look across the tools",
    summary: "Every tool now shares one clay design and one tray at the top, so moving between them feels like one app.",
    href: "/match",
    cta: "See it in Match",
  },
  {
    date: "2026-09-27",
    tag: "Write",
    title: "Every tool inside the workspace",
    summary: "Match, Review, Figures, Checks and your target journal open as windows over your paper, and keep their results when you close them.",
    points: ["Matching reads the PDF you compiled, on your device", "Jump from a review's quote to its line in your LaTeX", "Insert a figure straight into the paper"],
    href: "/write",
    cta: "Open the workspace",
  },
  {
    date: "2026-09-25",
    tag: "Write",
    title: "Write your paper in the browser",
    summary: "LaTeX in your journal's template, compiled to PDF on your device. Nothing to install, nothing uploaded.",
    points: ["Four templates that compile here, and links to eight publishers' own", "Backups and imports as a zip, Overleaf downloads included"],
    href: "/write",
    cta: "Start a paper",
  },
  {
    date: "2026-09-24",
    tag: "Match",
    title: "Better matches, with the reasons",
    summary: "Matching now reads your title, abstract and references, estimates your paper's topics, and says how good each match is, and why.",
    points: ["What we read, with a way to correct it", "Paste a title and abstract instead of a file", "Fit scores measured against real published papers"],
    href: "/match",
    cta: "Match a paper",
  },
  {
    date: "2026-09-23",
    tag: "Figures",
    title: "A figure studio",
    summary: "Turn a spreadsheet into a journal-ready figure, from a template or a sentence, drawn on your device.",
    points: ["14 templates, statistics, overlays and annotations", "Describe it to Claude; your data's values never leave", "PNG, TIFF, SVG and PDF at the journal's width"],
    href: "/figures",
    cta: "Make a figure",
  },
];
