"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import AddToPaper from "./_components/AddToPaper";
import FigureStudio from "./_components/FigureStudio";
import { useFigures } from "./_components/useFigures.ts";

// Attach a spreadsheet → check how it was read → start from a template →
// the figure redraws on this device on every change. The studio itself is
// FigureStudio over useFigures (shared with the writing workspace's Figures
// window); this page adds the header, the network trace and "Add to a paper".
export default function FiguresPage() {
  const f = useFigures();

  return (
    <main className="mx-auto w-full max-w-7xl px-6 pt-3 pb-20">
      <PageHeader
        width="4xl" tool="figures"
        title="Make a figure."
        subtitle={
          <p className="mt-3 max-w-md text-lg text-ink-soft">
            Upload your data, start from a template, and export a journal-ready figure, drawn on this device. Your values never leave this tab.
          </p>
        }
      />

      <FigureStudio
        figures={f}
        exportExtra={
          <AddToPaper
            disabled={!f.spec || !!f.problem}
            getPdf={async () => {
              const pdf = (await f.onExport(["pdf"], 300)).pdf;
              if (!pdf) throw new Error("The PDF export came back empty. Try Export first to see why.");
              return Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
            }}
          />
        }
      />


      <footer className="mt-16 border-t border-line/80 pt-6 text-sm text-ink-soft">
        <p>
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>{" "}
          , including the figure generator&apos;s exception.
        </p>
      </footer>
    </main>
  );
}
